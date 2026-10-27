import type { DocumentRangeReader, DocumentSource } from '@filumo/core';
import { throwIfAborted } from '@filumo/core';
import type { ArchiveBudget } from '../reader/ArchiveBudget';
import type { SourceReply, SourceRequest } from './protocol';

/** Worker 只获得受限来源接口，主线程保留鉴权、区间缓存和根会话预算。 */
export class SourceBridge {
  private sources = new Map<number, DocumentSource>();
  private ranges = new Map<number, DocumentRangeReader | undefined>();
  private streams = new Map<number, ReadableStreamDefaultReader<Uint8Array>>();
  private sequence = 0;
  constructor(private budget: ArchiveBudget) {}
  add(source: DocumentSource) {
    const id = ++this.sequence;
    this.sources.set(id, source);
    return {
      id,
      name: source.name,
      mimeType: source.mimeType,
      size: source.size,
    };
  }
  /** 返回上级后释放嵌套来源和区间缓存中的引用。 */
  remove(sourceId: number) {
    this.sources.delete(sourceId);
    this.ranges.delete(sourceId);
  }
  async reply(call: SourceRequest, signal: AbortSignal): Promise<SourceReply> {
    try {
      throwIfAborted(signal);
      const source = this.sources.get(call.sourceId);
      if (!source) throw new Error('归档来源已释放');
      let value: unknown;
      switch (call.method) {
        case 'usage':
          this.budget.consume(call.bytes ?? 0);
          break;
        case 'range-info': {
          const reader = await source.getRangeReader?.(signal);
          throwIfAborted(signal);
          this.ranges.set(call.sourceId, reader);
          value = reader ? reader.length : null;
          break;
        }
        case 'range': {
          const reader = this.ranges.get(call.sourceId);
          if (!reader) throw new Error('来源不支持区间读取');
          if ((call.length ?? 0) > 32 * 1024 * 1024)
            throw new Error('单次归档索引区间超过限制');
          value = (
            await reader.read(call.offset!, call.length!, signal)
          ).slice();
          break;
        }
        case 'stream-open': {
          if (!source.openStream) throw new Error('来源未提供可重放的数据流');
          const id = ++this.sequence;
          const reader = (await source.openStream(signal)).getReader();
          if (signal.aborted || this.sources.get(call.sourceId) !== source) {
            await reader.cancel(signal.reason).catch(() => undefined);
            reader.releaseLock();
            throw new Error('归档来源流已取消');
          }
          this.streams.set(id, reader);
          value = id;
          break;
        }
        case 'stream-next': {
          const reader = this.streams.get(call.streamId!);
          if (!reader) throw new Error('来源流已关闭');
          const part = await reader.read();
          value = part.done ? null : part.value.slice();
          if (part.done) {
            reader.releaseLock();
            this.streams.delete(call.streamId!);
          }
          break;
        }
        case 'stream-close': {
          const reader = this.streams.get(call.streamId!);
          if (reader) {
            await reader.cancel();
            reader.releaseLock();
            this.streams.delete(call.streamId!);
          }
          break;
        }
      }
      return { sourceReply: call.sourceCall, ok: true, value };
    } catch (error) {
      return {
        sourceReply: call.sourceCall,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        code:
          typeof (error as { code?: unknown })?.code === 'string'
            ? (error as { code: string }).code
            : undefined,
      };
    }
  }
  async cancelStreams() {
    for (const reader of this.streams.values()) {
      await reader.cancel().catch(() => undefined);
      try {
        reader.releaseLock();
      } catch {
        /* 等待取消完成的流由来源终止。 */
      }
    }
    this.streams.clear();
  }
  async dispose() {
    await this.cancelStreams();
    this.sources.clear();
    this.ranges.clear();
  }
}
