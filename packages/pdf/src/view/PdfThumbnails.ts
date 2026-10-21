import type { PdfViewport } from './PdfViewport';
/** 只为缩略图侧栏窗口创建任务，关闭侧栏即归还位图租约。 */
export class PdfThumbnails {
  readonly element: HTMLElement;
  private canvas: HTMLElement;
  private rows = new Map<
    number,
    {
      host: HTMLButtonElement;
      abort: AbortController;
      lease?: { dispose(): void };
    }
  >();
  private active = false;
  private closed = false;
  private frame?: number;
  private resize?: ResizeObserver;
  private currentPage = 0;
  private revealedPage = -1;
  private locale?: 'zh-CN' | 'en-US';
  private focusPage?: number;
  constructor(
    document: Document,
    private viewport: PdfViewport,
    private count: number,
    private navigate: (index: number) => void,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'filumo-pdf-thumbnails';
    this.canvas = document.createElement('div');
    this.canvas.style.height = count * 176 + 'px';
    this.element.append(this.canvas);
    this.element.onscroll = this.schedule;
    const Resize = document.defaultView?.ResizeObserver;
    if (Resize) this.resize = new Resize(this.schedule);
    this.element.tabIndex = 0;
    this.element.onkeydown = (event) => {
      let index: number;
      if (event.key === 'ArrowDown')
        index = Math.min(this.count - 1, this.currentPage + 1);
      else if (event.key === 'ArrowUp')
        index = Math.max(0, this.currentPage - 1);
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = this.count - 1;
      else return;
      event.preventDefault();
      this.focusPage = index;
      this.navigate(index);
    };
  }
  private schedule = () => {
    if (!this.active || this.closed || this.frame !== undefined) return;
    const window = this.element.ownerDocument.defaultView;
    if (window)
      this.frame = window.requestAnimationFrame(() => {
        this.frame = undefined;
        this.refresh();
      });
    else this.refresh();
  };
  refresh(): void {
    if (!this.active || this.closed) return;
    const begin = Math.max(0, Math.floor(this.element.scrollTop / 176) - 1),
      end = Math.min(
        this.count,
        Math.ceil(
          (this.element.scrollTop + Math.max(176, this.element.clientHeight)) /
            176,
        ) + 1,
      );
    for (const [index, row] of this.rows)
      if (index < begin || index >= end) {
        row.abort.abort();
        row.lease?.dispose();
        row.host.remove();
        this.rows.delete(index);
      }
    for (let index = begin; index < end; index++) {
      if (this.rows.has(index)) continue;
      const host = this.element.ownerDocument.createElement('button');
      host.type = 'button';
      host.setAttribute('role', 'option');
      host.className = 'filumo-pdf-thumbnail';
      host.style.top = index * 176 + 'px';
      host.textContent = String(index + 1);
      host.onclick = () => this.navigate(index);
      this.canvas.append(host);
      const row = {
        host,
        abort: new AbortController(),
        lease: undefined as { dispose(): void } | undefined,
      };
      this.rows.set(index, row);
      this.labelRow(index, row.host);
      void this.viewport
        .thumbnail(index, row.abort.signal)
        .then((lease) => {
          if (this.closed || row.abort.signal.aborted) {
            lease.dispose();
            return;
          }
          row.lease = lease;
          row.host.prepend(lease.canvas);
        })
        .catch((error) => {
          if (!row.abort.signal.aborted && this.active && !this.closed) {
            if (error instanceof Error && error.name === 'AbortError') {
              this.rows.delete(index);
              host.remove();
              // 等正文更新完队列代次再重排，避免取消后在微任务中无限重试。
              this.schedule();
            } else host.title = String(error);
          }
        });
    }
    if (this.focusPage !== undefined && this.rows.has(this.focusPage)) {
      this.rows.get(this.focusPage)!.host.focus({ preventScroll: true });
      this.focusPage = undefined;
    }
  }
  setActive(value: boolean): void {
    if (value === this.active) {
      if (value) this.refresh();
      return;
    }
    this.active = value;
    if (value) {
      this.resize?.observe(this.element);
      this.revealCurrent();
      this.refresh();
    } else {
      this.resize?.disconnect();
      this.focusPage = undefined;
      if (this.frame !== undefined)
        this.element.ownerDocument.defaultView?.cancelAnimationFrame(
          this.frame,
        );
      this.frame = undefined;
      for (const row of this.rows.values()) {
        row.abort.abort();
        row.lease?.dispose();
        row.host.remove();
      }
      this.rows.clear();
    }
  }
  private labelRow(index: number, host: HTMLButtonElement) {
    const label =
      this.locale === 'en-US'
        ? 'Page ' + (index + 1)
        : '第 ' + (index + 1) + ' 页';
    host.title = label;
    host.setAttribute('aria-label', label);
    host.setAttribute('aria-selected', String(index === this.currentPage));
    host.setAttribute('aria-posinset', String(index + 1));
    host.setAttribute('aria-setsize', String(this.count));
    host.tabIndex = index === this.currentPage ? 0 : -1;
  }
  private revealCurrent() {
    if (this.revealedPage === this.currentPage) return;
    this.revealedPage = this.currentPage;
    const top = this.currentPage * 176,
      bottom = top + 176;
    if (top < this.element.scrollTop) this.element.scrollTop = top;
    else if (bottom > this.element.scrollTop + this.element.clientHeight)
      this.element.scrollTop = Math.max(0, bottom - this.element.clientHeight);
  }
  /** 正文翻页时同步当前页，手动滚动缩略图后不因重复激活而重置位置。 */
  updateCurrent(index: number): void {
    if (this.currentPage === index) return;
    this.currentPage = index;
    for (const [page, row] of this.rows) this.labelRow(page, row.host);
    if (this.active) {
      this.revealCurrent();
      this.refresh();
    }
  }
  update(locale?: 'zh-CN' | 'en-US'): void {
    this.locale = locale;
    this.element.setAttribute('role', 'listbox');
    this.element.setAttribute(
      'aria-label',
      locale === 'en-US' ? 'Page thumbnails' : '页面缩略图',
    );
    for (const [index, row] of this.rows) this.labelRow(index, row.host);
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.setActive(false);
    this.resize?.disconnect();
    this.element.remove();
  }
}
