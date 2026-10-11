import type { WordPageMeta } from '../../engine/word/WordPageSource';
import { PageHeightIndex } from '../../layout/PageHeightIndex';
import { WordBlockPageIndex } from '../../layout/WordBlockPageIndex';
import type { OfficeRenderContext } from '../../view/types';
import { NativeWordSource } from './NativeWordSource';
import { WordPageView } from './WordPageView';
import { WordReviewOverlay } from './WordReviewOverlay';
interface Item {
  host: HTMLDivElement;
  signature: string;
  view?: WordPageView;
  overlay?: WordReviewOverlay;
  request?: AbortController;
}
/** 沿用原页面高度索引和两视口缓冲，延迟页面、几何测量及导航都由当前窗口拥有。 */
export class WordPageWindow {
  readonly element: HTMLDivElement;
  private top: HTMLDivElement;
  private bottom: HTMLDivElement;
  private items = new Map<number, Item>();
  private heights = new PageHeightIndex([]);
  private blocks = new WordBlockPageIndex();
  private metas: readonly WordPageMeta[] = [];
  private measured = new Map<string, number>();
  private active = true;
  private closed = false;
  private zoom: number;
  private revision = '';
  private range = '';
  private release?: () => void;
  private cancel?: () => void;
  private resize?: ResizeObserver;
  private stop: () => void;
  private key = 'word-window-' + Math.random().toString(36).slice(2);
  constructor(
    private readonly source: NativeWordSource,
    private readonly scroller: HTMLElement,
    private readonly base: OfficeRenderContext,
  ) {
    this.zoom = base.services.state.getState().zoom;
    this.element = base.document.createElement('div');
    this.element.className = 'office-file-word-pages';
    this.top = base.document.createElement('div');
    this.bottom = base.document.createElement('div');
    this.top.className = this.bottom.className =
      'office-file-word-pages__spacer';
    this.element.append(this.top, this.bottom);
    scroller.append(this.element);
    this.stop = source.subscribe(this.sync);
    scroller.addEventListener('scroll', this.schedule, { passive: true });
    const Resize = base.document.defaultView?.ResizeObserver;
    if (Resize) {
      this.resize = new Resize(this.schedule);
      this.resize.observe(scroller);
    }
    this.sync();
  }
  private signature(meta: WordPageMeta) {
    return (
      this.source.generation +
      ':' +
      meta.id +
      ':' +
      meta.revision +
      ':' +
      this.zoom +
      ':' +
      this.base.services.state.getState().revisionMode
    );
  }
  private sync = () => {
    if (this.closed) return;
    const snapshot = this.source.getSnapshot();
    this.blocks = new WordBlockPageIndex();
    snapshot.pages.forEach((meta) => this.blocks.replacePage(meta));
    const anchor = this.heights.length
        ? this.heights.findIndexAtOffset(this.scroller.scrollTop)
        : 0,
      offset = this.scroller.scrollTop - this.heights.prefix(anchor);
    const anchorBlock = this.metas[anchor]?.sourceBlockIds[0];
    const relocated = anchorBlock
      ? snapshot.pages.findIndex((meta) =>
          meta.sourceBlockIds.includes(anchorBlock),
        )
      : -1;
    this.metas = snapshot.pages;
    this.heights = new PageHeightIndex(
      snapshot.pages.map(
        (meta, index) =>
          (this.measured.get(this.signature(meta)) ??
            (meta.estimatedContentHeight * this.zoom) / 100) +
          (index === snapshot.pages.length - 1 ? 0 : 24),
      ),
    );
    if (this.scroller.scrollTop > 0)
      this.scroller.scrollTop = Math.max(
        0,
        this.heights.prefix(
          relocated >= 0
            ? relocated
            : Math.min(anchor, this.heights.length - 1),
        ) + offset,
      );
    this.base.services.state.updateDocument({
      pageCount: snapshot.pages.length,
    });
    this.schedule();
  };
  private schedule = () => {
    if (this.closed || !this.active) return;
    this.cancel = this.base.services.layout.schedule(
      this.key,
      () => ({
        top: this.scroller.scrollTop,
        height:
          this.scroller.clientHeight ||
          this.base.document.defaultView!.innerHeight,
      }),
      (value) => this.render(value.top, value.height),
    );
  };
  private render(top: number, height: number) {
    if (this.closed || !this.active) return;
    const metas = this.source.getSnapshot().pages,
      count = metas.length;
    if (!count) {
      this.top.style.height = '0px';
      this.bottom.style.height = '0px';
      return;
    }
    let start = Math.max(
        0,
        this.heights.findIndexAtOffset(Math.max(0, top - height * 2)),
      ),
      end = Math.min(
        count,
        this.heights.findIndexAtOffset(top + height * 3) + 1,
      );
    if (end - start < 3) {
      start = Math.max(0, start - 1);
      end = Math.min(count, start + 3);
      start = Math.max(0, end - 3);
    }
    this.top.style.height = this.heights.prefix(start) + 'px';
    this.bottom.style.height =
      Math.max(0, this.heights.total() - this.heights.prefix(end)) + 'px';
    this.element.dataset.pageCount = String(count);
    this.element.dataset.mountedPageCount = String(end - start);
    const range = start + ':' + end;
    if (range !== this.range) {
      this.range = range;
      this.release?.();
      this.release = this.source.retainRange(start, end);
      void this.source.ensureRange(start, end).catch(() => {});
    }
    for (const [index, item] of this.items)
      if (
        index < start ||
        index >= end ||
        item.signature !== this.signature(metas[index])
      ) {
        this.disposeItem(item);
        this.items.delete(index);
      }
    let cursor: ChildNode | null = this.top.nextSibling;
    for (let index = start; index < end; index++) {
      const meta = metas[index];
      let item = this.items.get(index);
      if (!item) {
        const host = this.base.document.createElement('div');
        host.className = 'office-file-word-pages__item';
        host.dataset.officeWordPageIndex = String(index);
        host.style.paddingBottom = index === count - 1 ? '0' : '24px';
        item = { host, signature: this.signature(meta) };
        this.items.set(index, item);
        if (meta.status === 'error') {
          const error = this.base.document.createElement('div'),
            retry = this.base.document.createElement('button');
          error.className = 'office-file-word-pages__placeholder';
          error.style.minHeight =
            (meta.estimatedContentHeight * this.zoom) / 100 + 'px';
          error.textContent = meta.errorMessage ?? '页面读取失败';
          retry.type = 'button';
          retry.textContent = this.base.locale === 'en-US' ? 'Retry' : '重试';
          retry.onclick = () => {
            this.source.retry(index);
            this.disposeItem(item!);
            this.items.delete(index);
            this.schedule();
          };
          error.append(retry);
          host.append(error);
        } else {
          const placeholder = this.base.document.createElement('div');
          placeholder.className = 'office-file-word-pages__placeholder';
          placeholder.style.minHeight =
            (meta.estimatedContentHeight * this.zoom) / 100 + 'px';
          placeholder.textContent =
            this.base.locale === 'en-US'
              ? 'Loading page ' + (index + 1)
              : '正在读取第 ' + (index + 1) + ' 页';
          host.append(placeholder);
          if (meta.status === 'ready') this.load(index, item);
        }
      }
      if (item.host !== cursor) this.element.insertBefore(item.host, cursor);
      cursor = item.host.nextSibling;
    }
    this.base.services.state.updateDocument({
      pageCount: count,
      pageIndex: Math.max(0, this.heights.findIndexAtOffset(top)),
    });
  }
  private load(index: number, item: Item) {
    const controller = new AbortController();
    item.request = controller;
    void this.source.getPage(index, controller.signal).then(
      (page) => {
        if (
          !page ||
          this.closed ||
          controller.signal.aborted ||
          this.items.get(index) !== item
        )
          return;
        item.request = undefined;
        const view = new WordPageView(
          this.source,
          page,
          index,
          this.base,
          this.zoom,
        );
        item.view = view;
        item.host.replaceChildren(view.element);
        item.overlay = new WordReviewOverlay(view, this.scroller, this.base);
        this.base.services.layout.schedule(
          this.key + '-size-' + index,
          () => {
            const calibration = new Map<string, number>();
            if (this.source.calibrationAllowed)
              view.element
                .querySelectorAll<HTMLElement>(
                  '[data-office-doc-pagination-id]',
                )
                .forEach((element) => {
                  if (
                    element.querySelector('img') ||
                    element.dataset.officeDocPaginationFragment === 'true'
                  )
                    return;
                  const id = element.dataset.officeDocPaginationId,
                    estimate = Number(element.dataset.officeDocEstimatedHeight);
                  if (!id || !Number.isFinite(estimate)) return;
                  const style =
                    element.ownerDocument.defaultView!.getComputedStyle(
                      element,
                    );
                  const height =
                    element.getBoundingClientRect().height / (this.zoom / 100) +
                    (parseFloat(style.marginTop) || 0) +
                    (parseFloat(style.marginBottom) || 0);
                  if (height > estimate + 0.75)
                    calibration.set(id, Math.ceil(height * 10) / 10);
                });
            return {
              height: view.element.getBoundingClientRect().height,
              calibration,
            };
          },
          (result) => {
            const value = result.height;
            if (this.closed || this.items.get(index) !== item) return;
            const signature = item.signature;
            const current = this.measured.get(signature);
            if (
              value > 0 &&
              (current === undefined || Math.abs(value - current) > 0.5)
            ) {
              this.measured.set(signature, value);
              this.sync();
            }
            if (result.calibration.size)
              this.source.calibrate(result.calibration);
          },
        );
      },
      (error) => {
        if (!this.closed && !controller.signal.aborted) {
          item.host.textContent = String(error);
        }
      },
    );
  }
  private disposeItem(item: Item) {
    item.request?.abort();
    item.overlay?.dispose();
    item.view?.dispose();
    item.host.remove();
  }
  update(zoom: number) {
    const mode = this.base.services.state.getState().revisionMode,
      key = zoom + ':' + mode;
    if (key === this.revision) return;
    this.revision = key;
    this.zoom = zoom;
    this.sync();
  }
  refreshText() {
    for (const item of this.items.values()) item.view?.refresh();
  }
  refreshAnnotations() {
    for (const item of this.items.values()) item.view?.refresh();
  }
  async goTo(index: number) {
    if (index < 0 || index >= this.source.getSnapshot().pages.length)
      throw new RangeError('页面索引超出范围');
    this.scroller.scrollTop = this.heights.prefix(index);
    this.schedule();
    await this.source.ensureRange(index, index + 1);
    for (let i = 0; i < 90 && !this.closed; i++) {
      if (this.items.get(index)?.view) return;
      await new Promise<void>((resolve) => {
        this.base.document.defaultView!.requestAnimationFrame(() => resolve());
      });
    }
    if (!this.closed) throw new Error('页面尚未完成布局');
  }
  async locate(blockId: string, markerId?: string) {
    let index = this.blocks.locate(blockId)?.pageIndex ?? -1;
    if (index < 0)
      index = await this.source.prioritizeBlock(blockId, this.base.signal);
    if (index < 0 || this.closed) return false;
    await this.goTo(index);
    const root = this.items.get(index)?.host;
    if (!root) return false;
    const elements = Array.from(
      root.querySelectorAll<HTMLElement>(
        '[data-office-word-block-id],[data-office-doc-pagination-id],[data-office-word-bookmark],[data-office-annotation-id],[data-office-word-revision],[id]',
      ),
    );
    const target =
      (markerId
        ? elements.find(
            (element) =>
              element.id === markerId ||
              element.dataset.officeWordBookmark === markerId ||
              element.dataset.officeAnnotationId === markerId ||
              element.dataset.officeWordRevision === markerId,
          )
        : undefined) ??
      elements.find(
        (element) =>
          element.dataset.officeWordBlockId === blockId ||
          element.dataset.officeDocPaginationId === blockId,
      );
    if (target) {
      const rect = target.getBoundingClientRect(),
        bounds = this.scroller.getBoundingClientRect();
      this.scroller.scrollTo({
        top: Math.max(
          0,
          Math.min(
            this.scroller.scrollHeight - this.scroller.clientHeight,
            this.scroller.scrollTop +
              rect.top -
              bounds.top -
              Math.max(24, (this.scroller.clientHeight - rect.height) / 2),
          ),
        ),
        behavior: this.base.document.defaultView?.matchMedia(
          '(prefers-reduced-motion: reduce)',
        ).matches
          ? 'auto'
          : 'smooth',
      });
    }
    return !!target;
  }
  setActive(active: boolean) {
    this.active = active;
    if (active) this.schedule();
    else this.cancel?.();
  }
  dispose() {
    this.closed = true;
    this.cancel?.();
    this.stop();
    this.resize?.disconnect();
    this.release?.();
    this.scroller.removeEventListener('scroll', this.schedule);
    for (const item of this.items.values()) this.disposeItem(item);
    this.items.clear();
    this.element.remove();
  }
}
