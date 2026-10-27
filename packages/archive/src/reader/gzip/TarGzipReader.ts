import type { ArchiveReader, ReaderContext } from '../contracts';
import type { TarRecord } from '../tar/TarReader';
import { scanTar } from '../tar/TarReader';
import { gzipStream } from './GzipReader';

/** 顺序游标跳过正文但仍让 GZIP 完成实际解码和校验。 */
class StreamCursor {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private bytes = new Uint8Array();
  private at = 0;
  private ended = false;
  constructor(stream: ReadableStream<Uint8Array>) {
    this.reader = stream.getReader();
  }
  private async take(length: number, keep: boolean) {
    const chunks: Uint8Array[] = [];
    let count = 0;
    while (count < length) {
      if (!this.bytes.length) {
        const next = await this.reader.read();
        if (next.done) {
          this.ended = true;
          break;
        }
        this.bytes = next.value;
      }
      const n = Math.min(length - count, this.bytes.length);
      if (keep) chunks.push(this.bytes.slice(0, n));
      this.bytes = this.bytes.subarray(n);
      count += n;
      this.at += n;
    }
    const out = new Uint8Array(keep ? count : 0);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return { count, bytes: out };
  }
  async read(offset: number, length: number) {
    if (offset < this.at) throw new Error('顺序 TAR 不能向后读取');
    if (offset > this.at) {
      const needed = offset - this.at;
      const skipped = await this.take(needed, false);
      if (skipped.count !== needed) return new Uint8Array();
    }
    return (await this.take(length, true)).bytes;
  }
  async drain() {
    this.bytes = new Uint8Array();
    while (!this.ended) {
      const part = await this.reader.read();
      if (part.done) this.ended = true;
    }
  }
  async close(reason?: unknown) {
    if (!this.ended) await this.reader.cancel(reason).catch(() => undefined);
    this.reader.releaseLock();
  }
}
/** TAR.GZ 需要顺序扫描，重新提取从头重放，不冒充随机访问。 */
export class TarGzipReader implements ArchiveReader {
  private records = new Map<string, TarRecord>();
  constructor(private context: ReaderContext) {}
  async *scan(signal: AbortSignal) {
    const cursor = new StreamCursor(await gzipStream(this.context, signal));
    try {
      for await (const record of scanTar(
        (at, len) => cursor.read(at, len),
        this.context,
      )) {
        this.records.set(record.entry.id, record);
        yield record.entry;
      }
      await cursor.drain();
    } finally {
      await cursor.close();
    }
  }
  async openEntry(id: string, signal: AbortSignal) {
    const record = this.records.get(id);
    if (!record || record.entry.kind !== 'file')
      throw new Error(record?.entry.error ?? '文件不存在');
    this.context.budget.entry(record.entry.size);
    const cursor = new StreamCursor(await gzipStream(this.context, signal));
    let at = 0;
    return new ReadableStream<Uint8Array>(
      {
        pull: async (c) => {
          try {
            if (at >= record.entry.size) {
              await cursor.drain();
              await cursor.close();
              c.close();
              return;
            }
            const bytes = await cursor.read(
              record.offset + at,
              Math.min(256 * 1024, record.entry.size - at),
            );
            if (!bytes.length) throw new Error('TAR.GZ 正文被截断');
            at += bytes.length;
            c.enqueue(bytes);
          } catch (error) {
            await cursor.close(error);
            c.error(error);
          }
        },
        cancel: (reason) => cursor.close(reason),
      },
      { highWaterMark: 0 },
    );
  }
  async close() {
    this.records.clear();
  }
}
