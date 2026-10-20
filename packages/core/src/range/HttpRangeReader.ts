import { FivoError, throwIfAborted } from '../errors';
import type { ResourcePolicy } from '../types';
import { validateRange } from './BlobRangeReader';
import { RangeCache } from './RangeCache';
import type { DocumentRangeReader } from './types';

const BLOCK_SIZE = 256 * 1024;

/** 来源探测的结果：不支持区间时将完整响应交回原下载路径，避免重复请求。 */
export interface HttpRangeSetup {
  reader?: DocumentRangeReader;
  fallbackResponse?: Response;
  mimeType?: string;
  finish?(): void;
}

function rangeHeader(response: Response) {
  const match = response.headers
    .get('content-range')
    ?.match(/^bytes (\d+)-(\d+)\/(\d+)$/i);
  if (!match) return undefined;
  const [start, end, total] = match.slice(1).map(Number);
  return [start, end, total].every(Number.isSafeInteger) &&
    start <= end &&
    end < total
    ? { start, end, total }
    : undefined;
}

/** 区间响应按声明长度有界消费，不能先分配任意大的 arrayBuffer 再发现超限。 */
async function readBlock(
  response: Response,
  expected: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== expected)
      throw new FivoError('INVALID_RANGE', '来源区间长度无效');
    return bytes;
  }
  const reader = response.body.getReader(),
    result = new Uint8Array(expected);
  let length = 0;
  try {
    while (true) {
      throwIfAborted(signal);
      const item = await reader.read();
      if (item.done) break;
      if (length + item.value.length > expected)
        throw new FivoError('INVALID_RANGE', '来源返回超出区间的数据');
      result.set(item.value, length);
      length += item.value.length;
    }
    if (length !== expected)
      throw new FivoError('INVALID_RANGE', '来源区间数据不完整');
    return result;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

/** 使用真实 206 确认高效区间能力，所有请求继承原来源鉴权及取消。 */
export async function createHttpRangeReader(
  url: string,
  request: RequestInit | undefined,
  policy: ResourcePolicy | undefined,
  lifetime: AbortSignal,
): Promise<HttpRangeSetup> {
  throwIfAborted(lifetime);
  if (
    (request?.method ?? 'GET').toUpperCase() !== 'GET' ||
    request?.body ||
    new Headers(request?.headers).has('Range')
  )
    return {};
  const fetchRange = async (
    start: number,
    end: number,
    signal: AbortSignal,
    validator?: string,
  ) => {
    throwIfAborted(signal);
    throwIfAborted(lifetime);
    const abort = new AbortController();
    const cancel = () => abort.abort(signal.reason ?? lifetime.reason);
    signal.addEventListener('abort', cancel, { once: true });
    lifetime.addEventListener('abort', cancel, { once: true });
    const headers = new Headers(request?.headers);
    headers.set('Range', `bytes=${start}-${end}`);
    if (validator) headers.set('If-Range', validator);
    try {
      const response = await fetch(url, {
        ...request,
        headers,
        signal: abort.signal,
      });
      // 返回响应的消费也在本调用内执行，不能提前拆除生命周期监听。
      return {
        response,
        finish: () => {
          signal.removeEventListener('abort', cancel);
          lifetime.removeEventListener('abort', cancel);
        },
      };
    } catch (error) {
      signal.removeEventListener('abort', cancel);
      lifetime.removeEventListener('abort', cancel);
      throw error;
    }
  };
  const initial = await fetchRange(0, BLOCK_SIZE - 1, lifetime);
  const response = initial.response;
  if (response.status === 200) {
    // 200 的流仍绑定来源 lifetime，归还后由来源负责消费或 cancel。
    return {
      fallbackResponse: response,
      finish: initial.finish,
      mimeType: response.headers.get('content-type') ?? undefined,
    };
  }
  const header = rangeHeader(response);
  if (
    response.status !== 206 ||
    !header ||
    header.start !== 0 ||
    header.end !== Math.min(BLOCK_SIZE, header.total) - 1 ||
    (response.headers.get('content-encoding') ?? 'identity').toLowerCase() !==
      'identity'
  ) {
    await response.body?.cancel().catch(() => undefined);
    initial.finish();
    if (!response.ok && response.status !== 416)
      throw new FivoError(
        'DOWNLOAD_FAILED',
        '文件下载失败：' + response.status,
      );
    return {};
  }
  if (
    policy?.maxFileBytes !== undefined &&
    header.total > policy.maxFileBytes
  ) {
    await response.body?.cancel().catch(() => undefined);
    initial.finish();
    throw new FivoError(
      'FILE_SIZE_LIMIT_EXCEEDED',
      '文件超过宿主配置的大小限制',
    );
  }
  let first: Uint8Array;
  try {
    first = await readBlock(response, header.end + 1, lifetime);
  } finally {
    initial.finish();
  }
  const etag = response.headers.get('etag');
  const validatorHeader =
    etag && !etag.startsWith('W/') ? 'etag' : 'last-modified';
  const validator = response.headers.get(validatorHeader) ?? undefined;
  const cache = new RangeCache(4 * 1024 * 1024 - first.length);
  lifetime.addEventListener(
    'abort',
    () => {
      first = new Uint8Array();
      cache.dispose();
    },
    { once: true },
  );
  const reader: DocumentRangeReader = {
    length: header.total,
    async read(offset, length, signal) {
      validateRange(offset, length);
      throwIfAborted(signal);
      throwIfAborted(lifetime);
      const end = Math.min(offset + length, header.total);
      const result = new Uint8Array(Math.max(0, end - offset));
      for (let at = offset; at < end; ) {
        const block = Math.floor(at / BLOCK_SIZE) * BLOCK_SIZE;
        const bytes =
          block === 0
            ? first
            : await cache.get(
                block,
                async (blockSignal) => {
                  const last = Math.min(header.total, block + BLOCK_SIZE) - 1;
                  const next = await fetchRange(
                    block,
                    last,
                    blockSignal,
                    validator,
                  );
                  try {
                    const range = rangeHeader(next.response);
                    const changed =
                      validator &&
                      next.response.headers.get(validatorHeader) !== validator;
                    if (
                      next.response.status !== 206 ||
                      !range ||
                      range.start !== block ||
                      range.end !== last ||
                      range.total !== header.total ||
                      changed ||
                      (
                        next.response.headers.get('content-encoding') ??
                        'identity'
                      ).toLowerCase() !== 'identity'
                    ) {
                      await next.response.body?.cancel().catch(() => undefined);
                      throw new FivoError(
                        'SOURCE_CHANGED',
                        '来源区间或文件版本发生变化，请重新打开文件',
                      );
                    }
                    const data = await readBlock(
                      next.response,
                      last - block + 1,
                      blockSignal,
                    );
                    return data;
                  } finally {
                    next.finish();
                  }
                },
                signal,
              );
        throwIfAborted(signal);
        const count = Math.min(bytes.length - (at - block), end - at);
        if (count <= 0)
          throw new FivoError('INVALID_RANGE', '来源区间数据不完整');
        result.set(bytes.subarray(at - block, at - block + count), at - offset);
        at += count;
      }
      return result;
    },
  };
  return {
    reader,
    mimeType: response.headers.get('content-type') ?? undefined,
  };
}
