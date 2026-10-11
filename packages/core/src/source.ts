import { abortError, FivoError, throwIfAborted } from './errors';
import { guardSource } from './guardSource';
import type { DocumentInput, DocumentSource, ResourcePolicy } from './types';

/** 校验限制值，不设置与文件格式无关的默认硬上限。 */
export function validatePolicy(policy?: ResourcePolicy): void {
  for (const value of [policy?.maxFileBytes, policy?.timeoutMs])
    if (value !== undefined && (!Number.isFinite(value) || value <= 0))
      throw new FivoError(
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
      throw new FivoError('INVALID_INPUT', '不支持的文档输入');
    const parsed = new URL(remote.url, options.baseUrl);
    if (!['http:', 'https:', 'blob:'].includes(parsed.protocol))
      throw new FivoError('INVALID_SOURCE_URL', '不支持此来源协议');
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
  const checkSize = (actual: number) => {
    if (
      options.resourcePolicy?.maxFileBytes !== undefined &&
      actual > options.resourcePolicy.maxFileBytes
    )
      throw new FivoError(
        'FILE_SIZE_LIMIT_EXCEEDED',
        '文件超过宿主配置的大小限制',
      );
  };
  const read = async (signal: AbortSignal): Promise<Uint8Array> => {
    if (disposed) throw new FivoError('SOURCE_DISPOSED', '文件来源已释放');
    throwIfAborted(signal);
    if (size !== undefined) checkSize(size);
    if (bytes) return bytes;
    if (!reading)
      reading = (async () => {
        const abort = () => localAbort.abort(signal.reason ?? abortError());
        signal.addEventListener('abort', abort, { once: true });
        try {
          if (blob) {
            bytes = new Uint8Array(await blob.arrayBuffer());
          } else {
            const response = await fetch(url!, {
              ...request,
              signal: localAbort.signal,
            });
            if (!response.ok)
              throw new FivoError(
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
          if (disposed) throw abortError();
          checkSize(bytes.byteLength);
          size = bytes.byteLength;
          return bytes;
        } finally {
          signal.removeEventListener('abort', abort);
        }
      })().catch((error) => {
        reading = undefined;
        throw error;
      });
    return reading;
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
    async dispose() {
      if (disposed) return;
      disposed = true;
      localAbort.abort();
      blob = undefined;
      bytes = undefined;
      reading = undefined;
    },
  };
}
