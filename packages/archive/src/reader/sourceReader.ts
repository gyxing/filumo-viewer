import type { DocumentRangeReader, DocumentSource } from '@filumo/core';
import { readSourceBytes, throwIfAborted } from '@filumo/core';

/** 区间能力不成立时才有界物化，不能先全文下载再称为随机读取。 */
export async function rangeSource(
  source: DocumentSource,
  limit: number,
  signal: AbortSignal,
): Promise<DocumentRangeReader> {
  const range = await source.getRangeReader?.(signal);
  if (range) return range;
  const bytes = await readSourceBytes(source, limit, signal);
  return {
    length: bytes.length,
    read: async (offset, length, current) => {
      throwIfAborted(current);
      return bytes.slice(offset, offset + length);
    },
  };
}
/** 每次从头创建流，供 GZIP 重新扫描，优先保留原来源的流式能力。 */
export async function sourceStream(
  source: DocumentSource,
  limit: number,
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  if (source.openStream) return source.openStream(signal);
  const range = await rangeSource(source, limit, signal);
  let offset = 0;
  return new ReadableStream(
    {
      async pull(c) {
        try {
          throwIfAborted(signal);
          if (offset >= range.length) {
            c.close();
            return;
          }
          const part = await range.read(
            offset,
            Math.min(256 * 1024, range.length - offset),
            signal,
          );
          offset += part.length;
          c.enqueue(part);
        } catch (error) {
          c.error(error);
        }
      },
    },
    { highWaterMark: 0 },
  );
}
