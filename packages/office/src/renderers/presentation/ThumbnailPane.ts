import type {
  PresentationSource,
  SlideModel,
} from '../../engine/presentation/types';
import type { OfficeRenderContext } from '../../view/types';
import { SlideScene } from './SlideScene';
interface Thumbnail {
  button: HTMLButtonElement;
  canvas: HTMLDivElement;
  label: HTMLDivElement;
  scene?: SlideScene;
  slide?: SlideModel;
  request?: AbortController;
  error?: boolean;
}
/** 可见窗口内复用完整原生 SlideScene，离开窗口立即释放节点及 Source 租约。 */
export class ThumbnailPane {
  readonly element: HTMLElement;
  private list: HTMLDivElement;
  private canvas: HTMLDivElement;
  private heading: HTMLDivElement;
  private items = new Map<number, Thumbnail>();
  private active = true;
  private closed = false;
  private selection = 0;
  private release?: () => void;
  private range = '';
  private resize?: ResizeObserver;
  private cancel?: () => void;
  private key = 'thumbs-' + Math.random().toString(36).slice(2);
  constructor(
    private readonly source: PresentationSource,
    private readonly context: OfficeRenderContext,
    private readonly select: (index: number) => void,
  ) {
    const doc = context.document;
    this.element = doc.createElement('aside');
    this.element.className = 'office-file-pptx-viewer__sidebar';
    this.heading = doc.createElement('div');
    this.heading.className = 'office-file-pptx-viewer__sidebar-header';
    this.list = doc.createElement('div');
    this.list.className = 'office-file-pptx-viewer__thumbnail-list';
    this.list.setAttribute('role', 'listbox');
    this.canvas = doc.createElement('div');
    this.canvas.style.position = 'relative';
    this.list.append(this.canvas);
    this.element.append(this.heading, this.list);
    this.list.onscroll = this.schedule;
    const Resize = doc.defaultView?.ResizeObserver;
    if (Resize) {
      this.resize = new Resize(this.schedule);
      this.resize.observe(this.list);
    }
  }
  private schedule = () => {
    if (this.closed || !this.active) return;
    this.cancel = this.context.services.layout.schedule(
      this.key,
      () => ({
        width: Math.max(100, this.list.clientWidth - 32),
        height: this.list.clientHeight || 500,
        top: this.list.scrollTop,
      }),
      (size) => this.render(size),
    );
  };
  private render(size: { width: number; height: number; top: number }) {
    if (this.closed || !this.active) return;
    const snapshot = this.source.getSnapshot();
    this.heading.textContent =
      this.context.locale === 'en-US'
        ? snapshot.slideCount + ' slides'
        : '共 ' + snapshot.slideCount + ' 页';
    // 卡片边框和内边距不属于幻灯片画布，缩略图缩放仅使用内容宽度。
    const contentWidth = Math.max(1, size.width - 18);
    const height = (contentWidth * snapshot.height) / snapshot.width + 56;
    const start = Math.max(0, Math.floor(size.top / height) - 5),
      end = Math.min(
        snapshot.slideCount,
        Math.ceil((size.top + size.height) / height) + 5,
      );
    this.canvas.style.height = snapshot.slideCount * height + 'px';
    const range = start + ':' + end;
    if (range !== this.range) {
      this.range = range;
      this.release?.();
      this.release =
        end > start ? this.source.retainRange(start, end - 1) : undefined;
    }
    for (const [index, item] of this.items)
      if (index < start || index >= end) {
        item.request?.abort();
        item.scene?.dispose();
        item.button.remove();
        this.items.delete(index);
      }
    for (let index = start; index < end; index++) {
      let item = this.items.get(index);
      const descriptor = snapshot.slides[index];
      if (!item) {
        const button = this.context.document.createElement('button'),
          canvas = this.context.document.createElement('div'),
          label = this.context.document.createElement('div');
        button.type = 'button';
        button.className = 'office-file-pptx-viewer__thumbnail-button';
        button.style.position = 'absolute';
        button.style.left = '0';
        canvas.className = 'office-file-pptx-thumbnail__canvas';
        canvas.style.overflow = 'hidden';
        label.className = 'office-file-pptx-thumbnail__label';
        button.append(canvas, label);
        button.onclick = () => {
          if (item!.error) {
            this.source.retry(index);
            item!.error = false;
            this.load(index, item!);
          }
          this.select(index);
        };
        button.onkeydown = (event) => {
          const next =
            event.key === 'ArrowDown'
              ? Math.min(snapshot.slideCount - 1, index + 1)
              : event.key === 'ArrowUp'
              ? Math.max(0, index - 1)
              : event.key === 'Home'
              ? 0
              : event.key === 'End'
              ? snapshot.slideCount - 1
              : undefined;
          if (next !== undefined) {
            event.preventDefault();
            this.select(next);
            this.setSelection(next);
            this.items.get(next)?.button.focus();
          }
        };
        item = { button, canvas, label };
        this.items.set(index, item);
        this.canvas.append(button);
      }
      item.button.style.top = index * height + 'px';
      item.button.style.height = height - 12 + 'px';
      item.canvas.style.height =
        (contentWidth * snapshot.height) / snapshot.width + 'px';
      item.button.setAttribute('role', 'option');
      item.button.setAttribute(
        'aria-selected',
        String(index === this.selection),
      );
      item.button.setAttribute('aria-posinset', String(index + 1));
      item.button.setAttribute('aria-setsize', String(snapshot.slideCount));
      item.button.tabIndex = index === this.selection ? 0 : -1;
      item.label.textContent =
        (this.context.locale === 'en-US'
          ? 'Slide ' + (index + 1)
          : '第 ' + (index + 1) + ' 页') +
        (descriptor?.hidden
          ? this.context.locale === 'en-US'
            ? ' (Hidden)'
            : '（隐藏）'
          : '');
      if (item.slide)
        item.scene?.update(item.slide, {
          zoom: (contentWidth / item.slide.width) * 100,
          interactive: false,
          renderKey: 'thumb-' + item.slide.id,
          media: false,
        });
      else if (!item.request && !item.error) this.load(index, item);
    }
  }
  private load(index: number, item: Thumbnail) {
    const controller = new AbortController();
    item.request = controller;
    item.canvas.textContent =
      this.context.locale === 'en-US' ? 'Loading' : '正在读取';
    void this.source.getSlide(index, controller.signal).then(
      (slide) => {
        if (
          this.closed ||
          controller.signal.aborted ||
          this.items.get(index) !== item
        )
          return;
        item.request = undefined;
        item.slide = slide;
        item.canvas.replaceChildren();
        item.scene = new SlideScene(slide, this.context, {
          zoom:
            (Math.max(1, Math.max(100, this.list.clientWidth - 32) - 18) /
              slide.width) *
            100,
          interactive: false,
          renderKey: 'thumb-' + slide.id,
          media: false,
        });
        item.canvas.append(item.scene.element);
      },
      (error) => {
        if (this.closed || controller.signal.aborted) return;
        item.request = undefined;
        item.error = true;
        item.canvas.textContent =
          (this.context.locale === 'en-US' ? 'Retry: ' : '点击重试：') +
          String(error);
      },
    );
  }
  setSelection(index: number) {
    const changed = this.selection !== index;
    this.selection = index;
    if (changed) {
      const snapshot = this.source.getSnapshot();
      const height =
        (Math.max(1, Math.max(100, this.list.clientWidth - 32) - 18) *
          snapshot.height) /
          snapshot.width +
        56;
      const top = index * height;
      if (top < this.list.scrollTop) this.list.scrollTop = top;
      else if (top + height > this.list.scrollTop + this.list.clientHeight)
        this.list.scrollTop = Math.max(
          0,
          top + height - this.list.clientHeight,
        );
    }
    this.schedule();
  }
  reset() {
    this.release?.();
    this.release = undefined;
    this.range = '';
    for (const item of this.items.values()) {
      item.request?.abort();
      item.scene?.dispose();
      item.button.remove();
    }
    this.items.clear();
    this.schedule();
  }
  refresh() {
    this.schedule();
  }
  setActive(active: boolean) {
    this.active = active;
    if (active) this.schedule();
    else {
      this.cancel?.();
      for (const item of this.items.values()) {
        item.request?.abort();
        item.request = undefined;
      }
    }
  }
  dispose() {
    this.closed = true;
    this.cancel?.();
    this.resize?.disconnect();
    this.release?.();
    for (const item of this.items.values()) {
      item.request?.abort();
      item.scene?.dispose();
    }
    this.items.clear();
    this.element.remove();
  }
}
