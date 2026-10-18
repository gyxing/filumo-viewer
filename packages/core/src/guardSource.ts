import { abortError, FivoError, throwIfAborted } from './errors';
import type { DocumentSource, ResourcePolicy } from './types';
const owners = new WeakMap<DocumentSource, number>();

/** 对不遵守取消的第三方读取器也停止等待，并移除监听，迟到结果由 Promise 消费。 */
export function waitForSource<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? abortError());
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

/** 来源工厂每次取得独立租约，统一限额与取消；共享对象仅在最后一个租约释放时销毁。 */
export function guardSource(
  raw: DocumentSource,
  policy?: ResourcePolicy,
): DocumentSource {
  if (
    !raw ||
    typeof raw.readAll !== 'function' ||
    typeof raw.dispose !== 'function'
  )
    throw new FivoError(
      'INVALID_SOURCE',
      '来源工厂没有返回合法 DocumentSource',
    );
  owners.set(raw, (owners.get(raw) ?? 0) + 1);
  let closed = false;
  let cached: Uint8Array | undefined;
  const lifetime = new AbortController();
  const check = (size: number | undefined) => {
    if (size !== undefined && (!Number.isFinite(size) || size < 0))
      throw new FivoError('INVALID_SOURCE_SIZE', '来源长度无效');
    if (
      size !== undefined &&
      policy?.maxFileBytes !== undefined &&
      size > policy.maxFileBytes
    )
      throw new FivoError(
        'FILE_SIZE_LIMIT_EXCEEDED',
        '文件超过宿主配置的大小限制',
      );
  };
  const run = async <T>(
    signal: AbortSignal,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    if (closed) throw new FivoError('SOURCE_DISPOSED', '文件来源已释放');
    throwIfAborted(signal);
    check(raw.size);
    const abort = new AbortController();
    const cancel = () =>
      abort.abort(signal.reason ?? lifetime.signal.reason ?? abortError());
    signal.addEventListener('abort', cancel, { once: true });
    lifetime.signal.addEventListener('abort', cancel, { once: true });
    try {
      const result = await waitForSource(
        Promise.resolve().then(() => {
          throwIfAborted(abort.signal);
          return operation(abort.signal);
        }),
        abort.signal,
      );
      throwIfAborted(abort.signal);
      check(raw.size);
      return result;
    } finally {
      signal.removeEventListener('abort', cancel);
      lifetime.signal.removeEventListener('abort', cancel);
    }
  };
  const read = (signal: AbortSignal, range?: [number, number]) =>
    run(signal, async (readingSignal) => {
      if (
        range &&
        (!range.every(Number.isSafeInteger) ||
          range.some((value) => value < 0) ||
          !Number.isSafeInteger(range[0] + range[1]))
      )
        throw new FivoError('INVALID_RANGE', '来源读取范围无效');
      if (cached)
        return range ? cached.slice(range[0], range[0] + range[1]) : cached;
      if (range && raw.readRange) {
        // 请求窗口可以大于文件；配额限制实际文件和返回数据，不把窗口末端当文件大小。
        const [offset, requested] = range;
        const limit = raw.size ?? policy?.maxFileBytes;
        const length = limit === undefined
          ? requested
          : Math.min(requested, Math.max(0, Math.floor(limit) - offset));
        if (!length) return new Uint8Array();
        const bytes = await raw.readRange(offset, length, readingSignal);
        check(bytes.byteLength);
        if (bytes.byteLength > length)
          throw new FivoError('INVALID_RANGE', '来源返回了超出请求范围的数据');
        return bytes;
      }
      const bytes = await raw.readAll(readingSignal);
      throwIfAborted(readingSignal);
      check(bytes.byteLength);
      cached = bytes;
      return range ? bytes.slice(range[0], range[0] + range[1]) : bytes;
    });
  return {
    get name() {
      return raw.name;
    },
    get mimeType() {
      return raw.mimeType;
    },
    get size() {
      return cached?.byteLength ?? raw.size;
    },
    get url() {
      return raw.url;
    },
    readAll: (signal) => read(signal),
    readBlob: raw.readBlob
      ? (signal) => run(signal, async (readingSignal) => {
          const blob = await raw.readBlob!(readingSignal);
          if (blob) check(blob.size);
          return blob;
        })
      : undefined,
    readRange: (offset, length, signal) => read(signal, [offset, length]),
    async dispose() {
      if (closed) return;
      closed = true;
      lifetime.abort();
      cached = undefined;
      const remaining = (owners.get(raw) ?? 1) - 1;
      if (remaining) owners.set(raw, remaining);
      else {
        owners.delete(raw);
        await raw.dispose();
      }
    },
  };
}
