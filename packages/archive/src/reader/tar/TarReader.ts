import type { DocumentRangeReader } from '@filumo/core';
import { throwIfAborted } from '@filumo/core';
import { archivePath } from '../archivePath';
import type { ArchiveEntry, ArchiveReader, ReaderContext } from '../contracts';
import { rangeSource } from '../sourceReader';
import { parseTarHeader } from './tarHeader';
import { parsePax } from './tarMetadata';
export interface TarRecord {
  entry: ArchiveEntry;
  offset: number;
}

/** 头部扫描共用于随机 TAR 和顺序解压流，不缓存文件正文。 */
export async function* scanTar(
  read: (offset: number, length: number) => Promise<Uint8Array>,
  context: ReaderContext,
): AsyncIterable<TarRecord> {
  let offset = 0,
    index = 0,
    metadataCount = 0;
  let global: Record<string, string> = {},
    local: Record<string, string> = {},
    longName: string | undefined;
  for (;;) {
    throwIfAborted(context.signal);
    const raw = await read(offset, 512);
    if (raw.length !== 512) throw new Error('TAR 归档被截断');
    const header = parseTarHeader(raw);
    if (!header) {
      const end = await read(offset + 512, 512);
      if (end.length !== 512 || !end.every((b) => b === 0))
        throw new Error('TAR 结束标记不完整');
      break;
    }
    const data = offset + 512;
    if (['x', 'g', 'L', 'K'].includes(header.type)) {
      if (
        ++metadataCount > context.budget.limits.maxEntries ||
        header.size > 1024 * 1024
      )
        throw new Error('TAR 元数据超过限制');
      const bytes = await read(data, header.size);
      if (bytes.length !== header.size) throw new Error('TAR 元数据不完整');
      if (header.type === 'x') local = parsePax(bytes);
      else if (header.type === 'g') global = { ...global, ...parsePax(bytes) };
      else if (header.type === 'L')
        longName = new TextDecoder().decode(bytes).split('\0')[0];
      offset = data + Math.ceil(header.size / 512) * 512;
      continue;
    }
    const attrs = { ...global, ...local };
    local = {};
    const size = attrs.size === undefined ? header.size : Number(attrs.size);
    if (!Number.isSafeInteger(size) || size < 0)
      throw new Error('TAR 条目大小无效');
    const rawPath = attrs.path ?? longName ?? header.path;
    longName = undefined;
    let path = rawPath,
      error: string | undefined;
    try {
      path = archivePath(rawPath);
    } catch (reason) {
      error = (reason as Error).message;
    }
    let kind: ArchiveEntry['kind'] =
      header.type === '5'
        ? 'directory'
        : ['0', '7'].includes(header.type)
        ? 'file'
        : 'unsupported';
    if (Object.keys(attrs).some((k) => k.startsWith('GNU.sparse'))) {
      kind = 'unsupported';
      error = '暂不支持稀疏 TAR 条目';
    }
    if (error) kind = 'unsupported';
    if (kind === 'unsupported') error ??= '此 TAR 条目类型不支持预览';
    context.budget.count(++index);
    const entry = {
      id: String(index),
      path,
      kind,
      size,
      modified: attrs.mtime ? Number(attrs.mtime) * 1000 : header.modified,
      error,
    };
    yield { entry, offset: data };
    offset = data + Math.ceil(size / 512) * 512;
    if (!Number.isSafeInteger(offset)) throw new Error('TAR 条目偏移溢出');
  }
}

/** 普通 TAR 只保存条目偏移，预览时读取对应正文片段。 */
export class TarReader implements ArchiveReader {
  private range?: DocumentRangeReader;
  private records = new Map<string, TarRecord>();
  constructor(private context: ReaderContext) {}
  async *scan(signal: AbortSignal) {
    this.range = await rangeSource(
      this.context.source,
      this.context.budget.limits.maxFullReadBytes,
      signal,
    );
    for await (const record of scanTar(
      (at, len) => this.range!.read(at, len, signal),
      this.context,
    )) {
      this.records.set(record.entry.id, record);
      yield record.entry;
    }
  }
  async openEntry(id: string, signal: AbortSignal) {
    const record = this.records.get(id);
    if (!record || record.entry.kind !== 'file')
      throw new Error(record?.entry.error ?? '文件不存在');
    this.context.budget.entry(record.entry.size);
    let at = 0;
    return new ReadableStream<Uint8Array>(
      {
        pull: async (c) => {
          try {
            throwIfAborted(signal);
            if (at >= record.entry.size) {
              c.close();
              return;
            }
            const count = Math.min(256 * 1024, record.entry.size - at),
              bytes = await this.range!.read(record.offset + at, count, signal);
            if (bytes.length !== count) throw new Error('TAR 正文不完整');
            this.context.budget.consume(bytes.length);
            await this.context.budget.checkpoint();
            at += bytes.length;
            c.enqueue(bytes);
          } catch (error) {
            c.error(error);
          }
        },
      },
      { highWaterMark: 0 },
    );
  }
  async close() {
    this.range = undefined;
    this.records.clear();
  }
}
