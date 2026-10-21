import { abortError, throwIfAborted } from '@filumo/core';
import { registerStyle } from '@filumo/dom';
import { PACKAGE_VERSION, STYLE_SCOPE } from '../generated/package';
interface StyleRequest {
  promise: Promise<void>;
  abort: AbortController;
  users: number;
  complete: boolean;
}
const pending = new WeakMap<Document, Map<string, StyleRequest>>();

/** 从同版发行样式中只注册文字层规则，并限定在 PDF 版本作用域内。 */
export async function ensureTextLayerStyles(
  document: Document,
  url: string,
  signal: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  let entries = pending.get(document);
  if (!entries) {
    entries = new Map();
    pending.set(document, entries);
  }
  let result = entries.get(url);
  if (!result) {
    const owned: StyleRequest = {
      promise: Promise.resolve(),
      abort: new AbortController(),
      users: 0,
      complete: false,
    };
    owned.promise = (async () => {
      let css: string;
      if (url.startsWith('filumo-pdf://bundled/')) {
        const { loadBundledPdfTextLayerCss } = await import(
          '@filumo/pdf/assets'
        );
        css = await loadBundledPdfTextLayerCss();
      } else {
        const response = await fetch(url, { signal: owned.abort.signal });
        if (!response.ok)
          throw new Error('PDF 文字层样式加载失败：' + response.status);
        css = await response.text();
      }
      throwIfAborted(owned.abort.signal);
      if (!css.includes('.' + STYLE_SCOPE) || !css.includes('.textLayer'))
        throw new Error('PDF 文字层样式版本不一致');
      registerStyle(
        'pdf',
        'pdf:' + PACKAGE_VERSION + ':pdfjs-6.4.299-text-layer',
        css,
      );
      owned.complete = true;
    })().catch((error) => {
      if (entries!.get(url) === owned) entries!.delete(url);
      throw error;
    });
    result = owned;
    entries.set(url, owned);
  }
  const owned = result;
  owned.users++;
  try {
    await new Promise<void>((resolve, reject) => {
      const cancel = () => reject(signal.reason ?? abortError());
      signal.addEventListener('abort', cancel, { once: true });
      void owned.promise
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', cancel));
      if (signal.aborted) cancel();
    });
    throwIfAborted(signal);
  } finally {
    owned.users--;
    // 只有最后一个等待者退出时才停止共享请求，避免一个会话取消破坏另一个会话。
    if (!owned.users && !owned.complete) {
      owned.abort.abort();
      if (entries.get(url) === owned) entries.delete(url);
    }
  }
}
