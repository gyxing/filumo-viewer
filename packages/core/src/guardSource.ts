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
  const read = async (signal: AbortSignal, range?: [number, number]) => {
    if (closed) throw new FivoError('SOURCE_DISPOSED', '文件来源已释放');
    throwIfAborted(signal);
    check(raw.size);
    if (range) {
      if (
        !range.every(Number.isSafeInteger) ||
        range.some((value) => value < 0)
      )
        throw new FivoError('INVALID_RANGE', '来源读取范围无效');
      check(range[0] + range[1]);
    }
    if (cached)
      return range ? cached.slice(range[0], range[0] + range[1]) : cached;
    const abort = new AbortController();
    const cancel = () =>
      abort.abort(signal.reason ?? lifetime.signal.reason ?? abortError());
    signal.addEventListener('abort', cancel, { once: true });
    lifetime.signal.addEventListener('abort', cancel, { once: true });
    try {
      const bytes = await waitForSource(
        Promise.resolve().then(() =>
          range && raw.readRange
            ? raw.readRange(range[0], range[1], abort.signal)
            : raw.readAll(abort.signal),
        ),
        abort.signal,
      );
      throwIfAborted(abort.signal);
      check(raw.size);
      check(bytes.byteLength);
      if (range && raw.readRange) return bytes;
      cached = bytes;
      return range ? bytes.slice(range[0], range[0] + range[1]) : bytes;
    } finally {
      signal.removeEventListener('abort', cancel);
      lifetime.signal.removeEventListener('abort', cancel);
    }
  };
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
