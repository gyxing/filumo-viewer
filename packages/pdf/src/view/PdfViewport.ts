import { throwIfAborted } from '@fivo/core';
import type { ViewContext, ViewOptions } from '@fivo/dom';
import { PDF_DEFAULTS } from '../options';
import type { PdfSession } from '../runtime/PdfSession';
import type {
  PdfBackend,
  PdfPageMetrics,
  PdfReadingPosition,
} from '../runtime/contracts';
import { PdfCanvasCache } from './PdfCanvasCache';
import { PdfPageLayout, type PdfAnchor } from './PdfPageLayout';
import { PdfPageView } from './PdfPageView';
import { PdfRenderQueue } from './PdfRenderQueue';
import './pages.less';
let thumbnailSequence = 0;

const CSS_UNITS = 4 / 3;
/** 全册逻辑布局与有限的页面 DOM 分离；滚动只更新附近窗口。 */
export class PdfViewport {
  readonly element: HTMLDivElement;
  private canvas: HTMLDivElement;
  private layout: PdfPageLayout;
  private queue: PdfRenderQueue;
  private cache: PdfCanvasCache;
  private pages = new Map<number, PdfPageView>();
  private retiring = new Set<Promise<void>>();
  private metrics = new Map<number, PdfPageMetrics>();
  private measuring = new Set<number>();
  private paints = new Map<number, Promise<void>>();
  private visible = new Set<number>();
  private controller = new AbortController();
  private resize?: ResizeObserver;
  private frame?: number;
  private active = true;
  private closed = false;
  private generation = 0;
  private scale = 1;
  private rotation = 0;
  private mode: 'fit-width' | 'percentage' = 'fit-width';
  private options: ViewOptions;
  private previousTop = 0;
  private index = 0;
  private interaction = 0;
  constructor(
    host: HTMLElement,
    private backend: PdfBackend,
    private session: PdfSession,
    private context: ViewContext,
    private onChange: () => void,
    first: PdfPageMetrics,
    private onReadingPosition?: (position: PdfReadingPosition) => void,
  ) {
    const document = host.ownerDocument;
    this.options = context.options;
    this.element = document.createElement('div');
    this.element.className = 'fivo-pdf-viewport';
    this.element.tabIndex = 0;
    this.canvas = document.createElement('div');
    this.canvas.className = 'fivo-pdf-pages';
    this.element.append(this.canvas);
    host.append(this.element);
    this.layout = new PdfPageLayout(backend.pageCount, first);
    this.layout.setMetrics(0, first);
    this.metrics.set(0, first);
    this.queue = new PdfRenderQueue(
      session.options.renderConcurrency ?? PDF_DEFAULTS.renderConcurrency,
    );
    this.cache = new PdfCanvasCache(
      document,
      session.options.canvasCacheBytes ?? PDF_DEFAULTS.canvasCacheBytes,
    );
    this.element.addEventListener('scroll', this.schedule, { passive: true });
    this.element.addEventListener('wheel', this.interact, { passive: true });
    this.element.addEventListener('touchstart', this.interact, {
      passive: true,
    });
    this.element.addEventListener('pointerdown', this.interact, {
      passive: true,
    });
    this.element.addEventListener('keydown', this.onReadingKey);
    const Resize = document.defaultView?.ResizeObserver;
    if (Resize) {
      this.resize = new Resize(() => {
        if (this.mode === 'fit-width') this.fitWidth();
        else this.schedule();
      });
      this.resize.observe(this.element);
    }
    context.session.signal.addEventListener('abort', this.cancel, {
      once: true,
    });
    if (this.options.zoom !== undefined) this.setZoom(this.options.zoom);
    else this.fitWidth();
  }
  getSnapshot() {
    return {
      index: this.index,
      count: this.backend.pageCount,
      zoom: (this.scale / CSS_UNITS) * 100,
      mode: this.mode,
      rotation: this.rotation,
    };
  }
  /** 与页码发布分开通知，使同页内的标题变化也能同步到大纲。 */
  getReadingPosition(): PdfReadingPosition {
    return {
      ...this.layout.captureReadingPosition(
        this.element.scrollTop,
        this.element.clientHeight,
      ),
      rotation: this.rotation,
      interaction: this.interaction,
    };
  }
  private interact = () => {
    if (this.closed || !this.active) return;
    // 在默认滚动发生前取消迟到的书签跳转，避免旧异步任务把阅读位置拉回去。
    this.interaction++;
    this.onReadingPosition?.(this.getReadingPosition());
  };
  private onReadingKey = (event: KeyboardEvent) => {
    if (
      [
        'ArrowUp',
        'ArrowDown',
        'PageUp',
        'PageDown',
        'Home',
        'End',
        ' ',
      ].includes(event.key)
    )
      this.interact();
  };
  private cancel = () => {
    void this.dispose();
  };
  private schedule = () => {
    if (this.closed || !this.active || this.frame !== undefined) return;
    const window = this.element.ownerDocument.defaultView;
    if (window)
      this.frame = window.requestAnimationFrame(() => {
        this.frame = undefined;
        this.renderWindow();
      });
    else this.renderWindow();
  };
  private position() {
    this.canvas.style.height = this.layout.totalHeight() + 'px';
    this.canvas.style.minWidth =
      Math.max(0, this.layout.maxWidth() + 32) + 'px';
    for (const [index, page] of this.pages) {
      const size = this.layout.getSize(index);
      page.element.style.top = this.layout.offsetOf(index) + 'px';
      page.element.style.width = size.width + 'px';
      page.element.style.height = size.height + 'px';
    }
  }
  private measure(index: number) {
    if (this.metrics.has(index) || this.measuring.has(index)) return;
    this.measuring.add(index);
    void this.backend
      .getMetrics(index, this.controller.signal)
      .then((metrics) => {
        if (this.closed) return;
        const anchor = this.layout.captureAnchor(this.element.scrollTop);
        this.metrics.set(index, metrics);
        this.layout.setMetrics(index, metrics);
        this.position();
        this.element.scrollTop = this.layout.restoreAnchor(anchor);
        this.schedule();
      })
      .catch(() => undefined)
      .finally(() => this.measuring.delete(index));
  }
  private renderWindow() {
    if (this.closed || !this.active) return;
    this.position();
    const top = this.element.scrollTop,
      height = Math.max(1, this.element.clientHeight),
      down = top >= this.previousTop;
    this.previousTop = top;
    const first = this.layout.findPage(top),
      last = this.layout.findPage(top + height);
    const begin = this.layout.findPage(
        Math.max(0, top - height * (down ? 0.5 : 1)),
      ),
      end = this.layout.findPage(top + height * (down ? 2 : 1.5));
    const visible = Array.from(
      { length: last - first + 1 },
      (_, offset) => first + offset,
    );
    const prefetch = Array.from(
      { length: end - begin + 1 },
      (_, offset) => begin + offset,
    ).filter((page) => !visible.includes(page));
    if (!down) prefetch.reverse();
    this.visible = new Set(visible);
    const wanted = new Set([...visible, ...prefetch]);
    for (const [index, page] of this.pages)
      if (!wanted.has(index)) {
        if (page.hasSelection()) {
          page.releaseBitmap();
          continue;
        }
        this.pages.delete(index);
        this.paints.delete(index);
        const cleanup = page.dispose().catch(this.context.onError);
        this.retiring.add(cleanup);
        void cleanup.then(() => this.retiring.delete(cleanup));
      }
    this.queue.updateWindow(visible, prefetch, this.generation);
    for (const index of [...visible, ...prefetch]) {
      this.measure(index);
      let page = this.pages.get(index);
      if (!page) {
        page = new PdfPageView(
          index,
          this.element.ownerDocument,
          this.backend,
          this.cache,
          this.session.options,
          () => {
            this.session.setFirstPageReady();
            this.onChange();
          },
          (target) => {
            void this.goTo(target).catch(this.context.onError);
          },
          (url) => this.external(url),
          () => {
            const target = this.pages.get(index);
            target?.releaseBitmap();
            this.schedule();
          },
          this.options.locale,
        );
        this.pages.set(index, page);
        this.canvas.append(page.element);
      }
      const owned = page,
        key =
          index +
          ':' +
          this.generation +
          ':' +
          this.scale +
          ':' +
          this.rotation;
      if (page.isRendered(key)) continue;
      const paint = this.queue.enqueue(
        key,
        index,
        this.generation,
        async (signal) => {
          // 当前可见页缺少预算时，先释放窗口内已完成的预取位图。
          for (const [other, value] of this.pages)
            if (other !== index && !this.visible.has(other))
              value.releaseBitmap();
          // 为当前可见页公平分配预算，并预留一小部分给侧栏缩略图。
          const share = Math.max(
            1,
            Math.floor(
              ((this.cache.maxBytes / 4) * 7) /
                8 /
                Math.max(3, this.visible.size),
            ),
          );
          await owned.render(key, this.scale, this.rotation, signal, share);
        },
      );
      this.paints.set(index, paint);
      void paint.catch(() => {
        if (!this.closed && this.active) this.schedule();
      });
    }
    this.position();
    const reading = this.getReadingPosition();
    if (this.index !== reading.pageIndex) {
      this.index = reading.pageIndex;
      this.onChange();
    }
    this.onReadingPosition?.(reading);
  }
  private external(url: string) {
    if (this.session.options.onHyperlinkActivate)
      this.session.options.onHyperlinkActivate(url);
    else
      this.element.ownerDocument.defaultView?.open(
        url,
        '_blank',
        'noopener,noreferrer',
      );
  }
  private change(scale: number, mode: 'fit-width' | 'percentage') {
    if (!Number.isFinite(scale) || scale <= 0) return;
    if (Math.abs(scale - this.scale) < 1e-8 && mode === this.mode) {
      this.schedule();
      return;
    }
    const anchor = this.layout.captureAnchor(this.element.scrollTop);
    this.mode = mode;
    this.scale = scale;
    this.generation++;
    this.queue.cancel();
    for (const page of this.pages.values()) page.releaseBitmap();
    this.layout.setScale(scale);
    this.position();
    this.element.scrollTop = this.layout.restoreAnchor(anchor);
    this.schedule();
    this.onChange();
  }
  setZoom(value: number): void {
    this.change(
      (Math.max(1, Math.min(500, value)) / 100) * CSS_UNITS,
      'percentage',
    );
  }
  fitWidth(): void {
    const size = this.layout.getSize(this.index);
    const naturalWidth = size.width / this.scale;
    this.change(
      Math.max(1, this.element.clientWidth - 32) / Math.max(1, naturalWidth),
      'fit-width',
    );
  }
  rotate(): void {
    const anchor = this.layout.captureAnchor(this.element.scrollTop);
    this.rotation = (this.rotation + 90) % 360;
    this.layout.setRotation(this.rotation);
    this.generation++;
    this.queue.cancel();
    for (const page of this.pages.values()) page.releaseBitmap();
    if (this.mode === 'fit-width') {
      const size = this.layout.getSize(this.index);
      this.scale =
        Math.max(1, this.element.clientWidth - 32) / (size.width / this.scale);
      this.layout.setScale(this.scale);
    }
    this.position();
    this.element.scrollTop = this.layout.restoreAnchor(anchor);
    this.schedule();
    this.onChange();
  }
  async goTo(
    index: number,
    signal = this.controller.signal,
    ratio = 0,
  ): Promise<void> {
    throwIfAborted(this.controller.signal);
    throwIfAborted(signal);
    if (!this.active) throw new Error('PDF 预览已暂停，请恢复后再跳转');
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.backend.pageCount
    )
      throw new Error('PDF 页码超出范围');
    const metrics = await this.backend.getMetrics(index, signal);
    throwIfAborted(this.controller.signal);
    throwIfAborted(signal);
    this.metrics.set(index, metrics);
    this.layout.setMetrics(index, metrics);
    this.index = index;
    this.position();
    this.element.scrollTop =
      this.layout.offsetOf(index) +
      Math.max(0, Math.min(1, ratio)) * this.layout.getSize(index).height;
    this.renderWindow();
    this.onChange();
    await this.paints.get(index);
    throwIfAborted(signal);
  }
  getPosition(): PdfAnchor {
    return this.layout.captureAnchor(this.element.scrollTop);
  }
  restorePosition(anchor: PdfAnchor): void {
    this.element.scrollTop = this.layout.restoreAnchor(anchor);
    this.schedule();
  }
  getPageElement(index: number): HTMLElement | undefined {
    return this.pages.get(index)?.element;
  }
  /** 缩略图共享正文渲染队列和像素预算，避免侧栏另开无限并发。 */
  async thumbnail(
    index: number,
    signal: AbortSignal,
  ): Promise<{ canvas: HTMLCanvasElement; dispose(): void }> {
    const result: { lease?: ReturnType<PdfCanvasCache['acquire']> } = {};
    const key = 'thumbnail:' + index + ':' + ++thumbnailSequence,
      generation = this.generation;
    await this.queue.enqueue(
      key,
      -1,
      generation,
      async (queueSignal) => {
        throwIfAborted(signal);
        const abort = new AbortController(),
          cancel = () => abort.abort(signal.reason ?? queueSignal.reason);
        signal.addEventListener('abort', cancel, { once: true });
        queueSignal.addEventListener('abort', cancel, { once: true });
        try {
          const metrics = await this.backend.getMetrics(index, abort.signal);
          throwIfAborted(abort.signal);
          const slots = Math.max(
            3,
            Math.ceil(this.element.clientHeight / 176) + 3,
          );
          const pixels = Math.max(
            1,
            Math.floor(this.cache.maxBytes / 4 / 8 / slots),
          );
          let scale = Math.min(
            120 / metrics.width,
            140 / metrics.height,
            Math.sqrt(pixels / (metrics.width * metrics.height)),
          );
          while (
            Math.ceil(metrics.width * scale) *
              Math.ceil(metrics.height * scale) >
            pixels
          )
            scale *= 0.999;
          for (const [page, value] of this.pages)
            if (!this.visible.has(page)) value.releaseBitmap();
          const lease = this.cache.acquire(
            key,
            Math.max(1, Math.ceil(metrics.width * scale)),
            Math.max(1, Math.ceil(metrics.height * scale)),
          );
          result.lease = lease;
          const job = this.backend.render(index, lease.canvas, {
            scale,
            rotation: 0,
            signal: abort.signal,
          });
          const stop = () => job.cancel();
          abort.signal.addEventListener('abort', stop, { once: true });
          try {
            await job.promise;
            throwIfAborted(abort.signal);
          } finally {
            abort.signal.removeEventListener('abort', stop);
          }
        } catch (error) {
          result.lease?.release();
          result.lease = undefined;
          throw error;
        } finally {
          signal.removeEventListener('abort', cancel);
          queueSignal.removeEventListener('abort', cancel);
        }
      },
      true,
    );
    if (!result.lease) throw new Error('缩略图没有交付画布');
    const owned = result.lease;
    return {
      canvas: owned.canvas,
      dispose: () => {
        owned.canvas.remove();
        owned.release();
        void this.backend.cleanupPage(index).catch(() => undefined);
      },
    };
  }
  update(options: ViewOptions): void {
    const zoomChanged = options.zoom !== this.options.zoom;
    this.options = options;
    for (const page of this.pages.values()) page.updateLocale(options.locale);
    if (zoomChanged && options.zoom !== undefined) this.setZoom(options.zoom);
    else this.schedule();
  }
  setActive(value: boolean): void {
    this.active = value;
    this.queue.setActive(value);
    if (value) {
      this.resize?.observe(this.element);
      this.schedule();
    } else {
      this.resize?.disconnect();
      if (this.frame !== undefined)
        this.element.ownerDocument.defaultView?.cancelAnimationFrame(
          this.frame,
        );
      this.frame = undefined;
    }
  }
  async dispose(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.controller.abort();
    this.context.session.signal.removeEventListener('abort', this.cancel);
    this.resize?.disconnect();
    this.element.removeEventListener('scroll', this.schedule);
    this.element.removeEventListener('wheel', this.interact);
    this.element.removeEventListener('touchstart', this.interact);
    this.element.removeEventListener('pointerdown', this.interact);
    this.element.removeEventListener('keydown', this.onReadingKey);
    if (this.frame !== undefined)
      this.element.ownerDocument.defaultView?.cancelAnimationFrame(this.frame);
    await this.queue.dispose();
    await Promise.allSettled(
      [...this.pages.values()]
        .map((page) => page.dispose())
        .concat([...this.retiring]),
    );
    this.pages.clear();
    this.retiring.clear();
    this.cache.dispose();
    this.element.remove();
  }
}
