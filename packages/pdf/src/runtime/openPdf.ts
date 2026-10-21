import type { DocumentSource, OpenContext } from '@filumo/core';
import { createSession, throwIfAborted } from '@filumo/core';
import { PDF_DEFAULTS, type PdfOptions } from '../options';
import { PdfSession } from './PdfSession';
/** 交付可读或可恢复的 PDF 会话，不等待全部页面绘制。 */
export async function openPdf(
  source: DocumentSource,
  context: OpenContext,
  options: PdfOptions,
) {
  for (const [key, value] of Object.entries(PDF_DEFAULTS)) {
    const actual = options[key as keyof typeof PDF_DEFAULTS] ?? value;
    if (
      !Number.isFinite(actual) ||
      actual <= 0 ||
      (key !== 'maxDpr' && !Number.isSafeInteger(actual))
    )
      throw new Error('PDF 性能预算无效：' + key);
  }
  if ((options.canvasCacheBytes ?? PDF_DEFAULTS.canvasCacheBytes) < 4)
    throw new Error('PDF 画布预算至少需要容纳一个像素');
  const data = new PdfSession(source, context, options);
  try {
    await data.initialize();
    throwIfAborted(context.signal);
    let stop = () => {};
    const session = createSession({
      ...context,
      source,
      format: 'pdf',
      data,
      partialReady: false,
      dispose: async () => {
        stop();
        await data.dispose();
      },
    });
    stop = data.subscribe(() =>
      session.update({ partialReady: data.getSnapshot().firstPageReady }),
    );
    return session;
  } catch (error) {
    await data.dispose().catch(() => undefined);
    throw error;
  }
}
