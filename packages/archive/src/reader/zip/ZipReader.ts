import { throwIfAborted } from '@filumo/core';
import type { Entry, ZipReader as NativeZipReader } from '@zip.js/zip.js';
import { archivePath } from '../archivePath';
import type { ArchiveEntry, ArchiveReader, ReaderContext } from '../contracts';
import { rangeSource } from '../sourceReader';

/** ZIP 按中央目录与条目读取，Reader 只代理实际请求的来源区间。 */
export class ZipReader implements ArchiveReader {
  private native?: NativeZipReader<unknown>;
  private files = new Map<string, Entry>();
  private entries: ArchiveEntry[] = [];
  private nativeCompression = true;
  constructor(private context: ReaderContext) {}
  private async init() {
    if (this.native) return;
    const range = await rangeSource(
      this.context.source,
      this.context.budget.limits.maxFullReadBytes,
      this.context.signal,
    );
    try {
      new DecompressionStream('deflate-raw');
    } catch {
      this.nativeCompression = false;
    }
    const zip = this.nativeCompression
      ? await import('@zip.js/zip.js/lib/zip-core-native.js')
      : await import('@zip.js/zip.js/lib/zip-core.js');
    const input = new zip.Reader(undefined);
    input.size = range.length;
    input.readUint8Array = (offset: number, length: number) =>
      range.read(offset, length, this.context.signal);
    this.native = new zip.ZipReader(input, {
      useWebWorkers: false,
      useCompressionStream: this.nativeCompression,
    });
  }
  async *scan(signal: AbortSignal) {
    await this.init();
    let index = 0;
    for await (const file of this.native!.getEntriesGenerator()) {
      throwIfAborted(signal);
      this.context.budget.count(++index);
      const id = String(index);
      let path = file.filename,
        error: string | undefined;
      try {
        path = archivePath(path);
      } catch (reason) {
        error = (reason as Error).message;
      }
      if (file.encrypted) error = '首版不支持加密压缩包';
      const entry: ArchiveEntry = {
        id,
        path,
        kind: error ? 'unsupported' : file.directory ? 'directory' : 'file',
        size: file.uncompressedSize,
        compressedSize: file.compressedSize,
        modified: file.lastModDate?.getTime(),
        error,
      };
      this.files.set(id, file);
      this.entries.push(entry);
      yield entry;
    }
  }
  async openEntry(id: string, signal: AbortSignal) {
    const file = this.files.get(id),
      entry = this.entries.find((e) => e.id === id);
    if (!file || file.directory || !entry || entry.error)
      throw new Error(entry?.error ?? '条目不是可读取的文件');
    this.context.budget.entry(entry.size);
    let output: TransformStreamDefaultController<Uint8Array>;
    const stream = new TransformStream<Uint8Array, Uint8Array>({
      start: (c) => {
        output = c;
      },
      transform: async (part, c) => {
        this.context.budget.consume(part.length);
        await this.context.budget.checkpoint();
        c.enqueue(part);
      },
    });
    const completion = file.getData(stream.writable, {
      signal,
      checkSignature: true,
      useWebWorkers: false,
      useCompressionStream: this.nativeCompression,
    });
    void completion.catch((reason) => output.error(reason));
    return stream.readable;
  }
  async close() {
    await this.native?.close();
    this.native = undefined;
    this.files.clear();
    this.entries = [];
  }
}
