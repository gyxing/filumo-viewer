import { abortError, FilumoError, throwIfAborted } from './errors';
import { guardSource, waitForSource } from './guardSource';
import { createBlobRangeReader } from './range/BlobRangeReader';
import {
  createHttpRangeReader,
  type HttpRangeSetup,
} from './range/HttpRangeReader';
import type { DocumentRangeReader } from './range/types';
import { guardByteStream, readStreamPrefix } from './sourceStream';
import type { DocumentInput, DocumentSource, ResourcePolicy } from './types';

/** 校验限制值，不设置与文件格式无关的默认硬上限。 */
export function validatePolicy(policy?: ResourcePolicy): void {
  for (const value of [policy?.maxFileBytes, policy?.timeoutMs])
    if (value !== undefined && (!Number.isFinite(value) || value <= 0))
      throw new FilumoError(
        'INVALID_RESOURCE_POLICY',
        '资源限制必须是大于零的有限数',
      );
}
/** 将本地或远程输入转换为独立会话的读取租约，不提前完整下载 URL。 */
export async function normalizeSource(
  input: DocumentInput,
  options: { baseUrl?: string; resourcePolicy?: ResourcePolicy } = {},
): Promise<DocumentSource> {
  validatePolicy(options.resourcePolicy);
  if (typeof input === 'function')
    return guardSource(await input(), options.resourcePolicy);
  let disposed = false;
  let bytes: Uint8Array | undefined;
  let reading: Promise<Uint8Array> | undefined;
  let blob: Blob | undefined;
  let name: string | undefined;
  let mimeType: string | undefined;
  let size: number | undefined;
  let url: string | undefined;
  let request: RequestInit | undefined;
  let rangeSetup: Promise<HttpRangeSetup> | undefined;
  let fallbackResponse: Response | undefined;
  let finishRange: (() => void) | undefined;
  let prefix: Uint8Array | undefined;
  let prefixReading: Promise<Uint8Array> | undefined;
  const localAbort = new AbortController();
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    blob = input;
    size = input.size;
    mimeType = input.type;
    name =
      'name' in input && typeof input.name === 'string'
        ? input.name
        : undefined;
  } else if (input instanceof Uint8Array) {
    bytes = input.slice();
    size = bytes.byteLength;
  } else {
    const remote = typeof input === 'string' ? { url: input } : input;
    if (!remote || typeof remote !== 'object' || !('url' in remote))
      throw new FilumoError('INVALID_INPUT', '不支持的文档输入');
    const parsed = new URL(remote.url, options.baseUrl);
    if (!['http:', 'https:', 'blob:'].includes(parsed.protocol))
      throw new FilumoError('INVALID_SOURCE_URL', '不支持此来源协议');
    url = parsed.href;
    request = remote.request;
    mimeType = remote.mimeType;
    name = remote.name;
    if (!name) {
      try {
        name =
          decodeURIComponent(parsed.pathname.split('/').pop() ?? '') ||
          undefined;
      } catch {
        name = undefined;
      }
    }
  }
  const externalAbort = () =>
    localAbort.abort(request?.signal?.reason ?? abortError());
  request?.signal?.addEventListener('abort', externalAbort, { once: true });
  if (request?.signal?.aborted) externalAbort();
  const checkSize = (actual: number) => {
    if (
      options.resourcePolicy?.maxFileBytes !== undefined &&
      actual > options.resourcePolicy.maxFileBytes
    )
      throw new FilumoError(
        'FILE_SIZE_LIMIT_EXCEEDED',
        '文件超过宿主配置的大小限制',
      );
  };
  // 内部初始化不等待全文读取，避免前缀与全文相互等待形成环。
  const setupRange = (signal: AbortSignal): Promise<HttpRangeSetup> => {
    if (!rangeSetup)
      rangeSetup = createHttpRangeReader(
        url!,
        request,
        options.resourcePolicy,
        localAbort.signal,
      )
        .then((setup) => {
          if (disposed) {
            void setup.fallbackResponse?.body?.cancel().catch(() => undefined);
            setup.finish?.();
            throw abortError();
          }
          fallbackResponse = setup.fallbackResponse;
          finishRange = setup.finish;
          mimeType ||= setup.mimeType;
          if (setup.reader) size = setup.reader.length;
          return setup;
        })
        .catch((error) => {
          rangeSetup = undefined;
          throw error;
        });
    return waitForSource(rangeSetup, signal);
  };
  const read = async (signal: AbortSignal): Promise<Uint8Array> => {
    if (disposed) throw new FilumoError('SOURCE_DISPOSED', '文件来源已释放');
    throwIfAborted(signal);
    throwIfAborted(localAbort.signal);
    if (size !== undefined) checkSize(size);
    if (bytes) return bytes;
    if (!reading) {
      const pendingPrefix = prefixReading;
      reading = (async () => {
        const abort = () => localAbort.abort(signal.reason ?? abortError());
        signal.addEventListener('abort', abort, { once: true });
        try {
          if (pendingPrefix) await waitForSource(pendingPrefix, signal);
          if (bytes) return bytes;
          if (blob) {
            bytes = new Uint8Array(await blob.arrayBuffer());
          } else {
            if (rangeSetup) await rangeSetup;
            const response =
              fallbackResponse ??
              (await fetch(url!, {
                ...request,
                signal: localAbort.signal,
              }));
            fallbackResponse = undefined;
            if (!response.ok)
              throw new FilumoError(
                'DOWNLOAD_FAILED',
                '文件下载失败：' + response.status,
              );
            mimeType =
              mimeType || response.headers.get('content-type') || undefined;
            const advertised = response.headers.get('content-length');
            if (advertised && Number.isFinite(Number(advertised)))
              checkSize(Number(advertised));
            if (!response.body)
              bytes = new Uint8Array(await response.arrayBuffer());
            else {
              const reader = response.body.getReader();
              const chunks: Uint8Array[] = [];
              let length = 0;
              try {
                while (true) {
                  const item = await reader.read();
                  if (item.done) break;
                  throwIfAborted(signal);
                  length += item.value.byteLength;
                  checkSize(length);
                  chunks.push(item.value);
                }
              } catch (error) {
                await reader.cancel().catch(() => undefined);
                throw error;
              } finally {
                reader.releaseLock();
              }
              bytes = new Uint8Array(length);
              let offset = 0;
              for (const chunk of chunks) {
                bytes.set(chunk, offset);
                offset += chunk.byteLength;
              }
            }
          }
          throwIfAborted(signal);
          throwIfAborted(localAbort.signal);
          if (disposed) throw abortError();
          checkSize(bytes.byteLength);
          size = bytes.byteLength;
          return bytes;
        } finally {
          finishRange?.();
          finishRange = undefined;
          signal.removeEventListener('abort', abort);
        }
      })().catch((error) => {
        if (disposed || signal.aborted || localAbort.signal.aborted)
          bytes = undefined;
        reading = undefined;
        throw error;
      });
    }
    return reading;
  };
  /** 普通 GET 探测共用前缀；特殊请求继续走原全文缓存，避免重放副作用。 */
  const readPrefix = async (
    length: number,
    signal: AbortSignal,
  ): Promise<Uint8Array> => {
    if (bytes) return bytes.slice(0, length);
    if (reading) return (await waitForSource(reading, signal)).slice(0, length);
    if (prefix && prefix.length >= length) return prefix.slice(0, length);
    if (prefixReading) {
      const current = await waitForSource(prefixReading, signal);
      if (current.length >= length) return current.slice(0, length);
      return readPrefix(length, signal);
    }
    if (size !== undefined && length >= size)
      return (await read(signal)).slice(0, length);
    const operation = Promise.resolve().then(async () => {
      // 主动取消沿用原读取的来源级终止语义；正常截断只 cancel 当前响应流。
      const cancelSource = () =>
        localAbort.abort(signal.reason ?? abortError());
      signal.addEventListener('abort', cancelSource, { once: true });
      try {
        throwIfAborted(signal);
        const { reader } = await setupRange(signal);
        if (reader)
          return reader.read(0, Math.min(length, reader.length), signal);
        const abort = new AbortController();
        const cancel = () =>
          abort.abort(
            signal.reason ?? localAbort.signal.reason ?? abortError(),
          );
        signal.addEventListener('abort', cancel, { once: true });
        localAbort.signal.addEventListener('abort', cancel, { once: true });
        const rangeFinish = finishRange;
        finishRange = undefined;
        let response: Response | undefined;
        const finish = () => {
          signal.removeEventListener('abort', cancel);
          localAbort.signal.removeEventListener('abort', cancel);
          rangeFinish?.();
        };
        try {
          throwIfAborted(signal);
          throwIfAborted(localAbort.signal);
          response =
            fallbackResponse ??
            (await fetch(url!, { ...request, signal: abort.signal }));
          fallbackResponse = undefined;
          throwIfAborted(signal);
          throwIfAborted(localAbort.signal);
          if (!response.ok)
            throw new FilumoError(
              'DOWNLOAD_FAILED',
              '文件下载失败：' + response.status,
            );
          mimeType ||= response.headers.get('content-type') ?? undefined;
          const advertised = response.headers.get('content-length');
          if (advertised && /^\d+$/.test(advertised)) {
            // 传输可能解压缩，截断前缀不能凭响应头宣称已知文档大小。
            checkSize(Number(advertised));
          }
          if (!response.body) {
            const result = new Uint8Array(await response.arrayBuffer());
            throwIfAborted(signal);
            throwIfAborted(localAbort.signal);
            checkSize(result.length);
            bytes = result;
            size = result.length;
            return result;
          }
          // 64 KiB 覆盖内置文本探测，多插件小窗口共享一次消费。
          const window = Math.max(
            length,
            Math.min(
              64 * 1024,
              size ?? Infinity,
              options.resourcePolicy?.maxFileBytes ?? Infinity,
            ),
          );
          const result = await readStreamPrefix(
            guardByteStream(
              response.body,
              signal,
              localAbort.signal,
              options.resourcePolicy?.maxFileBytes,
            ),
            window,
            signal,
          );
          throwIfAborted(signal);
          throwIfAborted(localAbort.signal);
          if (result.eof) {
            bytes = result.bytes;
            size = bytes.length;
          } else prefix = result.bytes.slice(0, 64 * 1024);
          return result.bytes;
        } catch (error) {
          if (response?.body && !response.body.locked)
            await response.body.cancel().catch(() => undefined);
          throw error;
        } finally {
          finish();
        }
      } finally {
        signal.removeEventListener('abort', cancelSource);
      }
    });
    prefixReading = operation;
    try {
      return (await waitForSource(operation, signal)).slice(0, length);
    } finally {
      // 取消等待者不能提前清空仍在清理的操作，防止后续读取抢占响应。
      void operation
        .finally(() => {
          if (prefixReading === operation) prefixReading = undefined;
        })
        .catch(() => undefined);
    }
  };
  return {
    get name() {
      return name;
    },
    get mimeType() {
      return mimeType;
    },
    get size() {
      return size;
    },
    get url() {
      return url;
    },
    readAll: read,
    async openStream(signal) {
      if (disposed) throw new FilumoError('SOURCE_DISPOSED', '文件来源已释放');
      throwIfAborted(signal);
      throwIfAborted(localAbort.signal);
      if (size !== undefined) checkSize(size);
      if (blob)
        return guardByteStream(
          blob.stream(),
          signal,
          localAbort.signal,
          options.resourcePolicy?.maxFileBytes,
        );
      if (bytes) {
        const current = bytes;
        return guardByteStream(
          new ReadableStream({
            start(c) {
              c.enqueue(current);
              c.close();
            },
          }),
          signal,
          localAbort.signal,
          options.resourcePolicy?.maxFileBytes,
        );
      }
      if (prefixReading) await waitForSource(prefixReading, signal);
      if (bytes) {
        const current = bytes;
        return guardByteStream(
          new ReadableStream({
            start(c) {
              c.enqueue(current);
              c.close();
            },
          }),
          signal,
          localAbort.signal,
          options.resourcePolicy?.maxFileBytes,
        );
      }
      if (rangeSetup) await waitForSource(rangeSetup, signal);
      const abort = new AbortController();
      const cancel = () =>
        abort.abort(signal.reason ?? localAbort.signal.reason ?? abortError());
      signal.addEventListener('abort', cancel, { once: true });
      localAbort.signal.addEventListener('abort', cancel, { once: true });
      const finish = () => {
        signal.removeEventListener('abort', cancel);
        localAbort.signal.removeEventListener('abort', cancel);
      };
      try {
        throwIfAborted(signal);
        throwIfAborted(localAbort.signal);
        const response =
          fallbackResponse ??
          (await fetch(url!, { ...request, signal: abort.signal }));
        fallbackResponse = undefined;
        const rangeFinish = finishRange;
        finishRange = undefined;
        if (!response.ok) {
          await response.body?.cancel();
          throw new FilumoError(
            'DOWNLOAD_FAILED',
            '文件下载失败：' + response.status,
          );
        }
        mimeType ||= response.headers.get('content-type') ?? undefined;
        const advertised = response.headers.get('content-length');
        if (advertised && /^\d+$/.test(advertised)) {
          size = Number(advertised);
          try {
            checkSize(size);
          } catch (error) {
            await response.body?.cancel();
            rangeFinish?.();
            throw error;
          }
        }
        if (!response.body)
          throw new FilumoError('INVALID_SOURCE', '来源未提供可读取的数据流');
        return guardByteStream(
          response.body,
          signal,
          localAbort.signal,
          options.resourcePolicy?.maxFileBytes,
          () => {
            finish();
            rangeFinish?.();
          },
        );
      } catch (error) {
        finish();
        throw error;
      }
    },
    async getRangeReader(signal): Promise<DocumentRangeReader | undefined> {
      if (disposed) throw new FilumoError('SOURCE_DISPOSED', '文件来源已释放');
      throwIfAborted(signal);
      throwIfAborted(localAbort.signal);
      if (size !== undefined) checkSize(size);
      if (blob) return createBlobRangeReader(blob, localAbort.signal);
      if (reading) await waitForSource(reading, signal);
      if (bytes)
        return {
          length: bytes.length,
          async read(offset, length, current) {
            throwIfAborted(current);
            throwIfAborted(localAbort.signal);
            if (
              ![offset, length, offset + length].every(Number.isSafeInteger) ||
              offset < 0 ||
              length < 0
            )
              throw new FilumoError('INVALID_RANGE', '来源读取范围无效');
            return bytes!.slice(offset, offset + length);
          },
        };
      return (await setupRange(signal)).reader;
    },
    async readBlob(signal) {
      if (disposed) throw new FilumoError('SOURCE_DISPOSED', '文件来源已释放');
      throwIfAborted(signal);
      throwIfAborted(localAbort.signal);
      if (size !== undefined) checkSize(size);
      return blob;
    },
    async readRange(offset, length, signal) {
      if (disposed) throw new FilumoError('SOURCE_DISPOSED', '文件来源已释放');
      throwIfAborted(signal);
      throwIfAborted(localAbort.signal);
      if (
        ![offset, length, offset + length].every(Number.isSafeInteger) ||
        offset < 0 ||
        length < 0
      )
        throw new FilumoError('INVALID_RANGE', '来源读取范围无效');
      if (size !== undefined) checkSize(size);
      if (!length) return new Uint8Array();
      if (
        !blob &&
        offset === 0 &&
        url?.startsWith('http') &&
        (request?.method ?? 'GET').toUpperCase() === 'GET' &&
        !request?.body &&
        !new Headers(request?.headers).has('Range')
      )
        return readPrefix(length, signal);
      // 非前缀与特殊请求继续共享原全文缓存，保留请求执行次数。
      if (!blob) return (await read(signal)).slice(offset, offset + length);
      const abort = new AbortController();
      const cancel = () =>
        abort.abort(signal.reason ?? localAbort.signal.reason ?? abortError());
      signal.addEventListener('abort', cancel, { once: true });
      localAbort.signal.addEventListener('abort', cancel, { once: true });
      try {
        const buffer = await waitForSource(
          blob.slice(offset, offset + length).arrayBuffer(),
          abort.signal,
        );
        throwIfAborted(abort.signal);
        return new Uint8Array(buffer);
      } finally {
        signal.removeEventListener('abort', cancel);
        localAbort.signal.removeEventListener('abort', cancel);
      }
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      localAbort.abort();
      request?.signal?.removeEventListener('abort', externalAbort);
      void fallbackResponse?.body?.cancel().catch(() => undefined);
      fallbackResponse = undefined;
      finishRange?.();
      finishRange = undefined;
      blob = undefined;
      bytes = undefined;
      reading = undefined;
      prefix = undefined;
      prefixReading = undefined;
    },
  };
}
