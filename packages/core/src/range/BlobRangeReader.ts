import { FilumoError, throwIfAborted } from '../errors';
import { waitForSource } from '../guardSource';
import type { DocumentRangeReader } from './types';

/** 校验区间整数和溢出，文件尾允许短读。 */
export function validateRange(offset: number, length: number): void {
  if (
    ![offset, length, offset + length].every(Number.isSafeInteger) ||
    offset < 0 ||
    length < 0
  )
    throw new FilumoError('INVALID_RANGE', '来源读取范围无效');
}

/** 为 Blob 提供切片读取，不为建立 Reader 提前分配全文字节。 */
export function createBlobRangeReader(
  blob: Blob,
  lifetime: AbortSignal,
): DocumentRangeReader {
  return {
    length: blob.size,
    async read(offset, length, signal) {
      validateRange(offset, length);
      throwIfAborted(signal);
      throwIfAborted(lifetime);
      const abort = new AbortController();
      const cancel = () => abort.abort(signal.reason ?? lifetime.reason);
      signal.addEventListener('abort', cancel, { once: true });
      lifetime.addEventListener('abort', cancel, { once: true });
      try {
        const buffer = await waitForSource(
          blob.slice(offset, offset + length).arrayBuffer(),
          abort.signal,
        );
        throwIfAborted(abort.signal);
        return new Uint8Array(buffer);
      } finally {
        signal.removeEventListener('abort', cancel);
        lifetime.removeEventListener('abort', cancel);
      }
    },
  };
}
