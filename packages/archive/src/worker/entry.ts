import type { DocumentSource } from '@filumo/core';
import { FilumoError } from '@filumo/core';
import { ArchiveBudget } from '../reader/ArchiveBudget';
import type { ArchiveReader } from '../reader/contracts';
import { openArchiveReader } from '../reader/openArchiveReader';
import type { ArchiveCommand, SourceReply, SourceRequest } from './protocol';
const worker = self as unknown as {
  postMessage(value: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent) => void) | null;
};
let calls = 0,
  current: ArchiveReader | undefined,
  currentSource = 0;
const replies = new Map<
  number,
  { resolve(value: unknown): void; reject(error: unknown): void }
>();
function sourceCall(
  sourceId: number,
  method: SourceRequest['method'],
  fields: Partial<SourceRequest> = {},
) {
  const id = ++calls;
  return new Promise<unknown>((resolve, reject) => {
    replies.set(id, { resolve, reject });
    worker.postMessage({ sourceCall: id, sourceId, method, ...fields });
  });
}
function proxy(info: ArchiveCommand['source']): DocumentSource {
  const call = (
    method: SourceRequest['method'],
    fields?: Partial<SourceRequest>,
  ) => sourceCall(info.id, method, fields);
  return {
    name: info.name,
    mimeType: info.mimeType,
    size: info.size,
    readAll: async () => {
      throw new Error('归档 Worker 禁止无界全文读取');
    },
    getRangeReader: async () => {
      const length = await call('range-info');
      if (typeof length !== 'number') return;
      return {
        length,
        read: async (offset, count) =>
          (await call('range', { offset, length: count })) as Uint8Array,
      };
    },
    openStream: async () => {
      const streamId = (await call('stream-open')) as number;
      return new ReadableStream<Uint8Array>(
        {
          async pull(c) {
            try {
              const bytes = (await call('stream-next', {
                streamId,
              })) as Uint8Array | null;
              if (bytes === null) c.close();
              else c.enqueue(bytes);
            } catch (error) {
              c.error(error);
            }
          },
          async cancel() {
            await call('stream-close', { streamId });
          },
        },
        { highWaterMark: 0 },
      );
    },
    dispose: async () => {},
  };
}
worker.onmessage = (event) => {
  const data = event.data as ArchiveCommand & SourceReply;
  if (typeof data.sourceReply === 'number') {
    const reply = replies.get(data.sourceReply);
    if (reply) {
      replies.delete(data.sourceReply);
      if (data.ok) reply.resolve(data.value);
      else
        reply.reject(
          data.code
            ? new FilumoError(data.code, data.message ?? '归档来源读取失败')
            : new Error(data.message),
        );
    }
    return;
  }
  if (!['open', 'extract'].includes(data.op)) return;
  void (async () => {
    const signal = new AbortController().signal;
    try {
      if (data.op === 'open' || !current || currentSource !== data.source.id) {
        await current?.close();
        const budget = new ArchiveBudget(
          data.policy,
          data.used,
          async (bytes) => {
            await sourceCall(data.source.id, 'usage', { bytes });
          },
        );
        current = await openArchiveReader({
          source: proxy(data.source),
          budget,
          format: data.format,
          assetsBaseUrl: data.assetsBaseUrl,
          signal,
        });
        currentSource = data.source.id;
        const entries = [];
        for await (const entry of current.scan(signal)) entries.push(entry);
        if (data.op === 'open') {
          worker.postMessage({ id: data.id, ok: true, entries });
          return;
        }
      }
      const reader = (
        await current!.openEntry(data.entryId!, signal)
      ).getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.length;
          if (length > (data.policy.maxEntryBytes ?? 128 * 1024 * 1024))
            throw new Error('文件超过单条目预览上限');
          chunks.push(part.value);
        }
      } catch (error) {
        await reader.cancel(error).catch(() => undefined);
        throw error;
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      worker.postMessage({ id: data.id, ok: true, bytes }, [bytes.buffer]);
    } catch (error) {
      worker.postMessage({
        id: data.id,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        code: (error as { code?: string })?.code,
      });
    }
  })();
};
