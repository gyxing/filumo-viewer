import { throwIfAborted } from '@filumo/core';
import type { ArchiveEntry, ArchiveReader, ReaderContext } from '../contracts';
import { sourceStream } from '../sourceReader';

/** 原生 GZIP 逐块计费，包括索引扫描丢弃的数据，不保存完整解压结果。 */
export async function gzipStream(context: ReaderContext, signal: AbortSignal) {
  if (typeof DecompressionStream === 'undefined')
    throw new Error('当前浏览器不支持原生 GZIP 解压');
  const stream = (
    await sourceStream(
      context.source,
      context.budget.limits.maxFullReadBytes,
      signal,
    )
  ).pipeThrough(new DecompressionStream('gzip'));
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform: async (part, c) => {
        throwIfAborted(signal);
        context.budget.consume(part.length);
        await context.budget.checkpoint();
        c.enqueue(part);
      },
    }),
  );
}
export class GzipReader implements ArchiveReader {
  private entry?: ArchiveEntry;
  constructor(private context: ReaderContext) {}
  async *scan(signal: AbortSignal) {
    const reader = (await gzipStream(this.context, signal)).getReader();
    let size = 0;
    try {
      for (;;) {
        const p = await reader.read();
        if (p.done) break;
        size += p.value.length;
      }
    } catch (error) {
      await reader.cancel(error).catch(() => undefined);
      throw error;
    } finally {
      reader.releaseLock();
    }
    this.entry = {
      id: '1',
      path:
        this.context.source.name?.replace(/\.(gz|gzip)$/i, '') ||
        'decompressed',
      kind: 'file',
      size,
    };
    yield this.entry;
  }
  async openEntry(id: string, signal: AbortSignal) {
    if (id !== '1' || !this.entry) throw new Error('文件不存在');
    this.context.budget.entry(this.entry.size);
    return gzipStream(this.context, signal);
  }
  async close() {
    this.entry = undefined;
  }
}
