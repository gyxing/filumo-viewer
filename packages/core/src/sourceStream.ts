import { abortError, FilumoError, throwIfAborted } from './errors';
import type { DocumentSource } from './types';

/** 流在消费期间持续持有取消监听，不能在交付 reader 时就释放来源租约。 */
export function guardByteStream(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  lifetime: AbortSignal,
  maxBytes?: number,
  finish?: () => void,
): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  let closed = false,
    length = 0;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let abort: () => void;
  const cleanup = () => {
    signal.removeEventListener('abort', abort);
    lifetime.removeEventListener('abort', abort);
    try {
      reader.releaseLock();
    } catch {
      /* 待处理的读取由取消结束后释放。 */
    }
    finish?.();
  };
  const fail = (error: unknown) => {
    if (closed) return;
    closed = true;
    controller.error(error);
    void reader
      .cancel(error)
      .catch(() => undefined)
      .finally(cleanup);
  };
  abort = () => fail(signal.reason ?? lifetime.reason ?? abortError());
  return new ReadableStream<Uint8Array>(
    {
      start(value) {
        controller = value;
        signal.addEventListener('abort', abort, { once: true });
        lifetime.addEventListener('abort', abort, { once: true });
        if (signal.aborted || lifetime.aborted) abort();
      },
      async pull() {
        if (closed) return;
        try {
          const item = await reader.read();
          if (closed) return;
          if (item.done) {
            closed = true;
            controller.close();
            cleanup();
            return;
          }
          if (!(item.value instanceof Uint8Array))
            throw new FilumoError('INVALID_SOURCE', '来源流没有返回字节');
          length += item.value.byteLength;
          if (maxBytes !== undefined && length > maxBytes)
            throw new FilumoError(
              'FILE_SIZE_LIMIT_EXCEEDED',
              '文件超过宿主配置的大小限制',
            );
          controller.enqueue(item.value);
        } catch (error) {
          fail(error);
        }
      },
      async cancel(reason) {
        if (closed) return;
        closed = true;
        try {
          await reader.cancel(reason);
        } finally {
          cleanup();
        }
      },
    },
    { highWaterMark: 0 },
  );
}

/** 在分配完整结果前执行大小限制，未知长度且没有流的第三方来源不能安全物化。 */
export async function readSourceBytes(
  source: DocumentSource,
  limit: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  throwIfAborted(signal);
  if (!Number.isSafeInteger(limit) || limit <= 0)
    throw new Error('读取上限必须是正整数');
  const check = (size: number) => {
    if (!Number.isSafeInteger(size) || size < 0 || size > limit)
      throw new FilumoError('FILE_SIZE_LIMIT_EXCEEDED', '文件超过完整读取上限');
  };
  if (source.size !== undefined) check(source.size);
  const range = await source.getRangeReader?.(signal);
  if (range) {
    check(range.length);
    const result = new Uint8Array(range.length);
    for (let offset = 0; offset < range.length; offset += 256 * 1024) {
      throwIfAborted(signal);
      const length = Math.min(256 * 1024, range.length - offset);
      const bytes = await range.read(offset, length, signal);
      throwIfAborted(signal);
      if (!(bytes instanceof Uint8Array) || bytes.length !== length)
        throw new FilumoError('INVALID_RANGE', '来源区间数据不完整');
      result.set(bytes, offset);
    }
    return result;
  }
  if (!source.openStream) {
    if (source.size === undefined)
      throw new FilumoError(
        'UNBOUNDED_SOURCE',
        '来源需要提供流式读取或可靠长度',
      );
    const bytes = await source.readAll(signal);
    throwIfAborted(signal);
    check(bytes.byteLength);
    return bytes.slice();
  }
  const stream = guardByteStream(
    await source.openStream(signal),
    signal,
    signal,
    limit,
  );
  const reader = stream.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      chunks.push(part.value);
      length += part.value.length;
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
  return bytes;
}
