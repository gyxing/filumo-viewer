import { FilumoError, throwIfAborted } from '@filumo/core';
import type { PdfOptions } from '../options';
import { PDF_DEFAULTS } from '../options';
import type { PdfBackend, PdfLayerLease } from '../runtime/contracts';
import { PdfCanvasCache, type PdfCanvasLease } from './PdfCanvasCache';
let sequence = 0;
type PageStatus =
  | 'preparing'
  | 'rendering'
  | 'ready'
  | 'layers'
  | 'failed'
  | 'budget';

/** 单页持有绘制与文字层资源，位图回收不直接破坏仍被选择的文字。 */
export class PdfPageView {
  readonly element: HTMLElement;
  private content: HTMLElement;
  private status: HTMLElement;
  private lease?: PdfCanvasLease;
  private layers?: PdfLayerLease;
  private controller = new AbortController();
  private rendering?: Promise<void>;
  private renderedKey = '';
  private closed = false;
  private identity = ++sequence;
  private statusKind: PageStatus = 'preparing';
  private statusDetail = '';
  constructor(
    readonly index: number,
    document: Document,
    private backend: PdfBackend,
    private cache: PdfCanvasCache,
    private options: PdfOptions,
    private ready: () => void,
    private navigate: (page: number) => void,
    private external: (url: string) => void,
    private retry: () => void,
    private locale?: 'zh-CN' | 'en-US',
  ) {
    this.element = document.createElement('section');
    this.element.className = 'filumo-pdf-page';
    this.element.dataset.pdfPage = String(index + 1);
    this.element.setAttribute(
      'aria-label',
      (locale === 'en-US' ? 'Page ' : '第 ') +
        (index + 1) +
        (locale === 'en-US' ? '' : ' 页'),
    );
    this.content = document.createElement('div');
    this.content.className = 'filumo-pdf-page-content';
    this.status = document.createElement('div');
    this.status.className = 'filumo-pdf-page-status';
    this.status.setAttribute('role', 'status');
    this.showStatus('preparing');
    this.element.append(this.content, this.status);
  }
  get hasBitmap(): boolean {
    return !!this.lease;
  }
  isRendered(key: string): boolean {
    return this.renderedKey === key;
  }
  private showStatus(kind: PageStatus, detail = ''): void {
    this.statusKind = kind;
    this.statusDetail = detail;
    const en = this.locale === 'en-US';
    const messages: Record<PageStatus, string> = {
      preparing: en ? 'Preparing page…' : '正在准备页面…',
      rendering: en ? 'Rendering…' : '正在渲染…',
      ready: '',
      layers: en ? 'Text layer unavailable: ' : '文字层不可用：',
      failed: en ? 'Page failed: ' : '页面加载失败：',
      budget: en ? 'Waiting for canvas budget…' : '正在等待画布预算…',
    };
    this.status.textContent = messages[kind] + detail;
    if (kind === 'failed' || kind === 'budget') {
      const button = this.element.ownerDocument.createElement('button');
      button.type = 'button';
      button.textContent = en ? 'Retry' : '重试';
      button.onclick = this.retry;
      this.status.append(button);
    }
  }
  updateLocale(locale?: 'zh-CN' | 'en-US'): void {
    this.locale = locale;
    this.showStatus(this.statusKind, this.statusDetail);
    this.element.setAttribute(
      'aria-label',
      (locale === 'en-US' ? 'Page ' : '第 ') +
        (this.index + 1) +
        (locale === 'en-US' ? '' : ' 页'),
    );
  }
  async render(
    key: string,
    scale: number,
    rotation: number,
    queueSignal: AbortSignal,
    pixelShare = Infinity,
  ): Promise<void> {
    if (this.closed || (this.renderedKey === key && this.lease)) return;
    this.controller.abort();
    await this.rendering?.catch(() => undefined);
    if (this.closed || queueSignal.aborted) return;
    const controller = (this.controller = new AbortController());
    const signal = controller.signal;
    const cancel = () => controller.abort(queueSignal.reason);
    queueSignal.addEventListener('abort', cancel, { once: true });
    const task = (async () => {
      await this.releaseLayers();
      this.releaseBitmap(true);
      const metrics = await this.backend.getMetrics(this.index, signal);
      throwIfAborted(signal);
      const swapped = rotation % 180 !== 0,
        w = swapped ? metrics.height : metrics.width,
        h = swapped ? metrics.width : metrics.height;
      const dpr = Math.min(
        this.element.ownerDocument.defaultView?.devicePixelRatio ?? 1,
        this.options.maxDpr ?? PDF_DEFAULTS.maxDpr,
      );
      const pixelBudget = Math.max(
        1,
        Math.min(
          this.options.maxCanvasPixels ?? PDF_DEFAULTS.maxCanvasPixels,
          Math.floor(this.cache.maxBytes / 4),
          pixelShare,
        ),
      );
      const ratio = Math.min(
        dpr,
        Math.sqrt(pixelBudget / (w * h * scale * scale)),
      );
      let renderScale = scale * ratio;
      // ceil 后仍要满足像素预算，避免边界处多分配一行像素。
      while (
        Math.ceil(w * renderScale) * Math.ceil(h * renderScale) >
        pixelBudget
      )
        renderScale *= 0.999;
      const lease = this.cache.acquire(
        key + ':' + this.identity,
        Math.ceil(w * renderScale),
        Math.ceil(h * renderScale),
      );
      this.lease = lease;
      lease.canvas.className = 'filumo-pdf-canvas';
      this.content.append(lease.canvas);
      this.showStatus('rendering');
      const job = this.backend.render(this.index, lease.canvas, {
        scale: renderScale,
        rotation,
        signal,
      });
      const stop = () => job.cancel();
      signal.addEventListener('abort', stop, { once: true });
      try {
        await job.promise;
      } finally {
        signal.removeEventListener('abort', stop);
      }
      throwIfAborted(signal);
      if (this.closed) return;
      this.renderedKey = key;
      this.showStatus('ready');
      this.ready();
      try {
        this.layers = await this.backend.mountLayers(this.index, this.content, {
          scale,
          rotation,
          signal,
          onNavigate: this.navigate,
          onExternalLink: this.external,
        });
      } catch (error) {
        if (!signal.aborted) this.showStatus('layers', String(error));
      }
      if (!signal.aborted && !this.closed) this.ready();
    })();
    this.rendering = task;
    try {
      await task;
    } catch (error) {
      this.releaseBitmap(true);
      if (
        !signal.aborted &&
        !this.closed &&
        !(error instanceof FilumoError && error.code === 'PDF_CANVAS_BUDGET')
      ) {
        this.renderedKey = key;
        this.showStatus('failed', String(error));
      }
      if (
        !signal.aborted &&
        !this.closed &&
        error instanceof FilumoError &&
        error.code === 'PDF_CANVAS_BUDGET'
      )
        this.showStatus('budget');
      if (signal.aborted) this.releaseBitmap(true);
    } finally {
      queueSignal.removeEventListener('abort', cancel);
      if (this.rendering === task) this.rendering = undefined;
    }
  }
  releaseBitmap(force = false): void {
    if (this.rendering && !force) return;
    if (this.lease) {
      this.lease.canvas.remove();
      this.lease.release();
      this.lease = undefined;
    }
    this.renderedKey = '';
  }
  private async releaseLayers() {
    const layers = this.layers;
    this.layers = undefined;
    await layers?.dispose();
  }
  hasSelection(): boolean {
    const selection = this.element.ownerDocument.defaultView?.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount)
      return false;
    try {
      return selection.getRangeAt(0).intersectsNode(this.element);
    } catch {
      return false;
    }
  }
  async dispose(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.controller.abort();
    await this.rendering?.catch(() => undefined);
    await this.releaseLayers();
    this.releaseBitmap();
    this.element.remove();
    await this.backend.cleanupPage(this.index);
  }
}
