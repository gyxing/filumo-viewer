import { readSourceBytes, throwIfAborted } from '@filumo/core';
import { archivePath } from '../archivePath';
import type { ArchiveEntry, ArchiveReader, ReaderContext } from '../contracts';
import { loadWasm } from './WasmRuntime';
type Runtime = Awaited<ReturnType<typeof loadWasm>>;
type NativeReader = InstanceType<Runtime['ArchiveReader']>;

/** 多格式引擎只接受受限输入，不能将完整内存接口当作大文件随机读取。 */
export class WasmArchiveReader implements ArchiveReader {
  private runtime?: Runtime;
  private input?: Uint8Array;
  private entries: ArchiveEntry[] = [];
  constructor(private context: ReaderContext) {}
  private async init(signal: AbortSignal) {
    if (!this.input)
      this.input = await readSourceBytes(
        this.context.source,
        this.context.budget.limits.maxWasmInputBytes,
        signal,
      );
    this.runtime ??= await loadWasm(this.context.assetsBaseUrl);
  }
  private native() {
    return new this.runtime!.ArchiveReader(
      this.runtime!.module,
      new Int8Array(
        this.input!.buffer,
        this.input!.byteOffset,
        this.input!.byteLength,
      ),
    );
  }
  private error(reader: NativeReader) {
    const message = reader.libarchive.error_string(reader.archive);
    if (message) throw new Error('归档读取失败：' + message);
  }
  async *scan(signal: AbortSignal) {
    await this.init(signal);
    const reader = this.native();
    let index = 0;
    try {
      for (;;) {
        throwIfAborted(signal);
        const file = reader.nextEntry();
        if (!file) {
          this.error(reader);
          break;
        }
        try {
          this.context.budget.count(++index);
          let path = file.getPathname(),
            error: string | undefined;
          try {
            path = archivePath(path);
          } catch (reason) {
            error = (reason as Error).message;
          }
          if (file.isEncrypted()) error = '首版不支持加密归档';
          const type = file.getFiletype();
          const entry: ArchiveEntry = {
            id: String(index),
            path,
            kind: error
              ? 'unsupported'
              : type === 'Directory'
              ? 'directory'
              : type === 'File'
              ? 'file'
              : 'unsupported',
            size: file.getSize(),
            modified: file.getModificationTime(),
            error,
          };
          if (entry.kind === 'unsupported')
            entry.error ??= '此归档条目类型暂不支持预览';
          this.entries.push(entry);
          yield entry;
          if (file.isEncrypted()) throw new Error('首版不支持加密归档');
          // 固实包的跳过也可能解码正文；显式逐块丢弃并计费，不能绕过根输出预算。
          if (type === 'File') {
            file.readCalled = true;
            let total = 0;
            for (;;) {
              throwIfAborted(signal);
              const bytes = reader.readData(256 * 1024);
              if (!bytes.length) break;
              total += bytes.length;
              this.context.budget.consume(bytes.length);
              await this.context.budget.checkpoint();
            }
            this.error(reader);
            if (total !== entry.size)
              throw new Error('归档条目实际大小与声明不一致');
          }
        } finally {
          file.free();
        }
      }
    } finally {
      reader.free();
    }
  }
  async openEntry(id: string, signal: AbortSignal) {
    const metadata = this.entries.find((e) => e.id === id);
    if (!metadata || metadata.kind !== 'file')
      throw new Error(metadata?.error ?? '文件不存在');
    this.context.budget.entry(metadata.size);
    await this.init(signal);
    const reader = this.native();
    let file: ReturnType<NativeReader['nextEntry']> = null,
      index = 0;
    try {
      for (;;) {
        throwIfAborted(signal);
        file = reader.nextEntry();
        if (!file) {
          this.error(reader);
          throw new Error('归档条目不存在');
        }
        if (String(++index) === id) break;
        file.free();
        file = null;
      }
    } catch (error) {
      file?.free();
      reader.free();
      throw error;
    }
    file!.readCalled = true;
    let closed = false,
      total = 0;
    const close = () => {
      if (!closed) {
        closed = true;
        file?.free();
        reader.free();
      }
    };
    return new ReadableStream<Uint8Array>(
      {
        pull: async (c) => {
          try {
            throwIfAborted(signal);
            const bytes = reader.readData(256 * 1024);
            if (!bytes.length) {
              this.error(reader);
              if (total !== metadata.size)
                throw new Error('归档条目实际大小与声明不一致');
              close();
              c.close();
              return;
            }
            total += bytes.length;
            this.context.budget.entry(total);
            this.context.budget.consume(bytes.length);
            await this.context.budget.checkpoint();
            c.enqueue(
              new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
            );
          } catch (error) {
            close();
            c.error(error);
          }
        },
        cancel: () => close(),
      },
      { highWaterMark: 0 },
    );
  }
  async close() {
    this.input = undefined;
    this.runtime = undefined;
    this.entries = [];
  }
}
