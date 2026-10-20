import { abortError, throwIfAborted } from '@fivo/core';
import type { PdfAssetLocations } from '../assets';
import type {
  PdfBackend,
  PdfOutlineDestination,
  PdfOutlineEntry,
  PdfRenderJob,
} from './contracts';
import type {
  EngineDocument,
  EnginePage,
  EngineViewport,
  PdfEngine,
} from './pdfEngine';
import { ensureTextLayerStyles } from './textLayerStyles';

/** 当前引擎只提供点转换；文字与链接矩形统一用同一个视口转换两端。 */
function viewportRectangle(
  viewport: EngineViewport,
  rect: readonly number[],
): number[] {
  return [
    ...viewport.convertToViewportPoint(rect[0], rect[1]),
    ...viewport.convertToViewportPoint(rect[2], rect[3]),
  ];
}

/** 每一层只等待自己的取消，不让第三方不可取消的读取永久挂住视图。 */
export function waitPdf<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason ?? abortError());
    if (signal.aborted) {
      cancel();
      void promise.catch(() => undefined);
      return;
    }
    signal.addEventListener('abort', cancel, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', cancel);
        if (signal.aborted) cancel();
        else resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', cancel);
        reject(error);
      },
    );
  });
}

/** 将 PDF.js 对象封装在包内；页面视图只消费稳定的 Fivo 内部合同。 */
export function createPdfBackend(
  document: EngineDocument,
  engine: PdfEngine,
  assets: PdfAssetLocations,
  lifetime: AbortSignal,
): PdfBackend {
  const pages = new Map<number, Promise<EnginePage>>();
  const jobs = new Set<PdfRenderJob>();
  let closed = false;
  const page = async (index: number, signal: AbortSignal) => {
    if (closed) throw abortError();
    throwIfAborted(lifetime);
    throwIfAborted(signal);
    if (!Number.isInteger(index) || index < 0 || index >= document.numPages)
      throw new Error('PDF 页码超出范围');
    let result = pages.get(index);
    if (!result) {
      result = document.getPage(index + 1).catch((error) => {
        pages.delete(index);
        throw error;
      });
      pages.set(index, result);
    }
    return waitPdf(result, signal);
  };
  const resolveDestination = async (
    dest: unknown,
    signal: AbortSignal,
  ): Promise<
    { pageIndex: number; destination?: PdfOutlineDestination } | undefined
  > => {
    const value =
      typeof dest === 'string'
        ? await waitPdf(document.getDestination(dest), signal)
        : dest;
    if (!Array.isArray(value) || !value.length) return undefined;
    const first: unknown = value[0];
    const index =
      typeof first === 'number'
        ? first
        : await waitPdf(document.getPageIndex(first), signal);
    if (!Number.isInteger(index) || index < 0 || index >= document.numPages)
      return undefined;
    const mode = (value[1] as { name?: string } | undefined)?.name;
    const point: PdfOutlineDestination = {};
    const finite = (number: unknown): number | undefined =>
      typeof number === 'number' && Number.isFinite(number)
        ? number
        : undefined;
    // 各目标类型的坐标槽位不同；null 表示保持当前位置，不能当作数字零。
    if (
      mode === 'XYZ' ||
      mode === 'FitR' ||
      mode === 'FitV' ||
      mode === 'FitBV'
    )
      point.left = finite(value[2]);
    if (mode === 'XYZ') point.top = finite(value[3]);
    else if (mode === 'FitH' || mode === 'FitBH') point.top = finite(value[2]);
    else if (mode === 'FitR') point.top = finite(value[5]);
    if (point.left === undefined) delete point.left;
    if (point.top === undefined) delete point.top;
    return {
      pageIndex: index,
      destination: Object.keys(point).length ? point : undefined,
    };
  };
  const backend: PdfBackend = {
    pageCount: document.numPages,
    async getMetrics(index, signal) {
      const item = await page(index, signal),
        viewport = item.getViewport({ scale: 1 });
      if (
        !Number.isFinite(viewport.width * viewport.height) ||
        viewport.width <= 0 ||
        viewport.height <= 0
      )
        throw new Error('PDF 页面尺寸无效');
      return {
        width: viewport.width,
        height: viewport.height,
        rotation: item.rotate,
      };
    },
    render(index, canvas, options) {
      let native: { promise: Promise<void>; cancel(): void } | undefined;
      let cancelled = false;
      const job: PdfRenderJob = {
        cancel() {
          cancelled = true;
          native?.cancel();
        },
        promise: Promise.resolve(),
      };
      const cancel = () => job.cancel();
      options.signal.addEventListener('abort', cancel, { once: true });
      jobs.add(job);
      job.promise = page(index, options.signal)
        .then(async (item) => {
          if (cancelled) throw abortError();
          const viewport = item.getViewport({
            scale: options.scale,
            rotation: (item.rotate + options.rotation) % 360,
          });
          canvas.width = Math.max(1, Math.ceil(viewport.width));
          canvas.height = Math.max(1, Math.ceil(viewport.height));
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas 2D 不可用');
          native = item.render({
            canvas,
            canvasContext: context,
            viewport,
            background: '#ffffff',
          });
          await native.promise;
          if (cancelled || closed) throw abortError();
        })
        .finally(() => {
          jobs.delete(job);
          options.signal.removeEventListener('abort', cancel);
        });
      return job;
    },
    async readText(index, signal) {
      const item = await page(index, signal),
        source = await waitPdf(item.getTextContent(), signal);
      const viewport = item.getViewport({ scale: 1 });
      const runs: Array<{ start: number; end: number; rect: number[] }> = [];
      let text = '';
      for (const run of source.items)
        if ('str' in run) {
          const start = text.length;
          text += run.str;
          const rect = viewportRectangle(viewport, [
            run.transform[4],
            run.transform[5],
            run.transform[4] + run.width,
            run.transform[5] + run.height,
          ]);
          runs.push({
            start,
            end: text.length,
            rect: [
              Math.min(rect[0], rect[2]),
              Math.min(rect[1], rect[3]),
              Math.max(rect[0], rect[2]),
              Math.max(rect[1], rect[3]),
            ],
          });
          if (run.hasEOL) text += '\n';
        }
      return { text, runs };
    },
    async mountLayers(index, host, options) {
      const item = await page(index, options.signal);
      await ensureTextLayerStyles(
        host.ownerDocument,
        assets.textLayerCss,
        options.signal,
      );
      const content = await waitPdf(item.getTextContent(), options.signal);
      throwIfAborted(options.signal);
      const root = host.ownerDocument.createElement('div'),
        text = host.ownerDocument.createElement('div'),
        links = host.ownerDocument.createElement('div');
      root.className = 'fivo-pdf-layers';
      text.className = 'textLayer';
      links.className = 'fivo-pdf-links';
      root.append(text, links);
      host.append(root);
      const viewport = item.getViewport({
        scale: options.scale,
        rotation: (item.rotate + options.rotation) % 360,
      });
      root.style.setProperty(
        '--total-scale-factor',
        String(viewport.scale * (viewport.userUnit ?? 1)),
      );
      root.style.setProperty('--scale-factor', String(viewport.scale));
      root.style.setProperty('--scale-round-x', '1px');
      root.style.setProperty('--scale-round-y', '1px');
      const layer = new engine.TextLayer({
        textContentSource: content,
        container: text,
        viewport,
      });
      let released = false;
      let abort = () => {};
      const dispose = async () => {
        if (released) return;
        released = true;
        layer.cancel();
        root.remove();
        options.signal.removeEventListener('abort', abort);
      };
      abort = () => {
        void dispose();
      };
      options.signal.addEventListener('abort', abort, { once: true });
      try {
        await waitPdf(layer.render(), options.signal);
        const annotations = await waitPdf(
          item.getAnnotations({ intent: 'display' }),
          options.signal,
        );
        for (const annotation of annotations) {
          if (annotation.subtype !== 'Link' || !annotation.rect) continue;
          const rect = viewportRectangle(viewport, annotation.rect);
          const anchor = host.ownerDocument.createElement('a');
          anchor.className = 'fivo-pdf-link';
          anchor.style.left = Math.min(rect[0], rect[2]) + 'px';
          anchor.style.top = Math.min(rect[1], rect[3]) + 'px';
          anchor.style.width = Math.abs(rect[2] - rect[0]) + 'px';
          anchor.style.height = Math.abs(rect[3] - rect[1]) + 'px';
          if (annotation.url) {
            let url: URL;
            try {
              url = new URL(annotation.url);
            } catch {
              continue;
            }
            if (!['http:', 'https:', 'mailto:'].includes(url.protocol))
              continue;
            anchor.href = url.href;
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
            anchor.setAttribute('aria-label', url.href);
            anchor.onclick = (event) => {
              event.preventDefault();
              options.onExternalLink(url.href);
            };
          } else {
            const resolved = await resolveDestination(
              annotation.dest,
              options.signal,
            );
            if (!resolved) continue;
            const target = resolved.pageIndex;
            anchor.href = '#page=' + (target + 1);
            anchor.setAttribute('aria-label', String(target + 1));
            anchor.onclick = (event) => {
              event.preventDefault();
              options.onNavigate(target);
            };
          }
          links.append(anchor);
        }
        throwIfAborted(options.signal);
        return { dispose };
      } catch (error) {
        await dispose();
        throw error;
      }
    },
    async readOutline(signal) {
      const source = await waitPdf(document.getOutline(), signal);
      let sequence = 0;
      const read = async (
        items: NonNullable<typeof source>,
      ): Promise<PdfOutlineEntry[]> => {
        const result: PdfOutlineEntry[] = [];
        for (const item of items) {
          throwIfAborted(signal);
          const children = await read(item.items ?? []),
            target = await resolveDestination(item.dest, signal);
          if (target !== undefined || children.length)
            result.push({
              id: String(++sequence),
              title: item.title,
              pageIndex: target?.pageIndex ?? children[0].pageIndex,
              destination: target?.destination,
              children,
            });
        }
        return result;
      };
      return read(source ?? []);
    },
    async getOutlineOffset(index, destination, rotation, signal) {
      const item = await page(index, signal);
      try {
        throwIfAborted(signal);
        throwIfAborted(lifetime);
        const viewport = item.getViewport({
          scale: 1,
          rotation: (item.rotate + rotation) % 360,
        });
        const x = destination.left ?? viewport.viewBox?.[0],
          y = destination.top ?? viewport.viewBox?.[3];
        if (
          x === undefined ||
          y === undefined ||
          !Number.isFinite(x + y) ||
          viewport.height <= 0
        )
          return undefined;
        const offset =
          viewport.convertToViewportPoint(x, y)[1] / viewport.height;
        return Number.isFinite(offset)
          ? Math.max(0, Math.min(1, offset))
          : undefined;
      } finally {
        // 只换算当前页的书签，使用后尝试归还页面缓存；活动绘制由引擎拒绝清理。
        if (item.cleanup()) pages.delete(index);
      }
    },
    async cleanupPage(index) {
      const result = pages.get(index);
      if (!result) return;
      const item = await result.catch(() => undefined);
      if (item?.cleanup()) pages.delete(index);
    },
    async dispose() {
      if (closed) return;
      closed = true;
      for (const job of jobs) job.cancel();
      await Promise.allSettled([...jobs].map((job) => job.promise));
      pages.clear();
    },
  };
  return backend;
}
