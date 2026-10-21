import { abortError } from '@filumo/core';

/** 停止等待不响应取消的插件；取消后才交付的句柄由此处唯一释放。 */
export function waitForView<T>(
  load: () => T | PromiseLike<T>,
  signal: AbortSignal,
  releaseLate?: (value: T) => void | Promise<void>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
      reject(signal.reason ?? abortError());
    };
    if (signal.aborted) {
      cancel();
      return;
    }
    signal.addEventListener('abort', cancel, { once: true });
    void Promise.resolve().then(() => {
      if (cancelled) throw signal.reason ?? abortError();
      return load();
    }).then(async (value) => {
      signal.removeEventListener('abort', cancel);
      if (cancelled) await releaseLate?.(value);
      else resolve(value);
    }, (error) => {
      signal.removeEventListener('abort', cancel);
      reject(error);
    }).catch(() => {
      // 迟到资源的清理错误不能覆盖已交付的新文档。
    });
  });
}
