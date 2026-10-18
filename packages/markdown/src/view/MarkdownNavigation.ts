import type { MarkdownHeading } from '../parser/types';
import type { MarkdownOutline } from './MarkdownOutline';

/** 管理正文局部定位、标题位置缓存和目录同步，不参与内容渲染。 */
export class MarkdownNavigation {
  private active = true;
  private closed = false;
  private outlineFrame?: number;
  private layoutObserver?: ResizeObserver;
  private headingOffsets?: Array<{ id: string; top: number }>;
  private outlineTarget?: { id: string; top: number };
  constructor(
    private scroll: HTMLDivElement,
    private article: HTMLElement,
    private headingNodes: ReadonlyMap<string, HTMLElement>,
    private targets: ReadonlyMap<string, HTMLElement>,
    private outline: MarkdownOutline,
    private headings: readonly MarkdownHeading[],
    private prefix: string,
  ) {
    scroll.addEventListener('scroll', this.schedule, { passive: true });
    scroll.ownerDocument.defaultView?.addEventListener('resize', this.invalidate);
    const Resize = scroll.ownerDocument.defaultView?.ResizeObserver;
    if (Resize) this.layoutObserver = new Resize(this.invalidate);
    this.setActive(true);
  }
  target(id: string) {
    return this.targets.get(id) ?? this.targets.get(id.toLowerCase());
  }
  revealTarget(id: string) {
    if (!this.active || this.closed) return;
    const target = this.target(id);
    if (!target) return;
    this.openAncestors(target);
    const headingId = target.id.slice(this.prefix.length);
    this.revealRect(target.getBoundingClientRect(), 'start');
    if (this.headingNodes.has(headingId)) {
      // 底部可能截断定位距离；记录实际落点，后续滚动通知不能覆盖用户刚选的章节。
      this.outlineTarget = { id: headingId, top: this.scroll.scrollTop };
      this.outline.setCurrent(headingId);
    }
  }
  openAncestors(element: HTMLElement | null) {
    let changed = false;
    while (element && element !== this.article) {
      if (element.tagName === 'DETAILS' && !(element as HTMLDetailsElement).open) {
        (element as HTMLDetailsElement).open = true;
        changed = true;
      }
      element = element.parentElement;
    }
    if (changed) this.invalidate();
  }
  /** 仅调整正文滚动，避免 scrollIntoView 连带移动目录、外框和宿主页面。 */
  revealRect(rect: DOMRect, align: 'start' | 'center') {
    if (!this.active || this.closed) return;
    this.outlineTarget = undefined;
    const viewport = this.scroll.getBoundingClientRect();
    const top =
      this.scroll.scrollTop + rect.top - viewport.top - this.scroll.clientTop;
    // 标题预留顶部间距，查找结果居中；超出一屏的匹配从起始位置显示。
    const inset =
      align === 'center'
        ? Math.max(0, (this.scroll.clientHeight - rect.height) / 2)
        : 16;
    this.scroll.scrollTop = Math.max(0, top - inset);
    this.schedule();
  }
  invalidate = () => {
    this.headingOffsets = undefined;
    this.schedule();
  };
  schedule = () => {
    if (
      !this.active ||
      this.closed ||
      this.outline.element.hidden ||
      this.outlineFrame !== undefined
    )
      return;
    const window = this.scroll.ownerDocument.defaultView;
    if (window)
      this.outlineFrame = window.requestAnimationFrame(() => {
        this.outlineFrame = undefined;
        this.syncOutline();
      });
    else this.syncOutline();
  };
  private syncOutline() {
    if (
      !this.active || this.closed || this.outline.element.hidden
    )
      return;
    const requested = this.outlineTarget;
    if (requested) {
      const heading = this.headingNodes.get(requested.id);
      if (Math.abs(this.scroll.scrollTop - requested.top) < 1 && heading?.getClientRects().length) {
        const rect = heading.getBoundingClientRect();
        const viewport = this.scroll.getBoundingClientRect();
        if (rect.bottom > viewport.top && rect.top < viewport.bottom) {
          this.outline.setCurrent(requested.id);
          return;
        }
      }
      // 正文实际滚动，或排版后目标已不可见时，恢复按阅读位置同步大纲。
      this.outlineTarget = undefined;
    }
    if (!this.headingOffsets) {
      const origin =
        this.scroll.getBoundingClientRect().top + this.scroll.clientTop;
      this.headingOffsets = this.headings.flatMap(({ id }) => {
        const heading = this.headingNodes.get(id);
        return heading?.getClientRects().length
          ? [{
              id,
              top: heading.getBoundingClientRect().top - origin +
                this.scroll.scrollTop,
            }]
          : [];
      }).sort((left, right) => left.top - right.top);
    }
    const headings = this.headingOffsets;
    if (!headings.length) return;
    // 排版变化时才重新测量，连续滚动通过二分查找定位当前章节。
    let low = 0,
      high = headings.length;
    const edge = this.scroll.scrollTop + 24;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (headings[middle].top <= edge) low = middle + 1;
      else high = middle;
    }
    const bottom = this.scroll.scrollTop + this.scroll.clientHeight;
    const atEnd =
      this.scroll.scrollTop > 0 && bottom >= this.scroll.scrollHeight - 1;
    const index = atEnd && headings[headings.length - 1].top <= bottom
      ? headings.length - 1
      : Math.max(0, low - 1);
    this.outline.setCurrent(headings[index].id);
  }
  /** 隐藏目录时只停止同步帧，正文锚点和查找定位仍可使用。 */
  stopOutlineSync() {
    if (this.outlineFrame !== undefined)
      this.scroll.ownerDocument.defaultView?.cancelAnimationFrame(
        this.outlineFrame,
      );
    this.outlineFrame = undefined;
  }

  /** 手工恢复滚动或跳到文首后，解除目录点击的暂时定位。 */
  resetTarget(): void {
    this.outlineTarget = undefined;
  }
  /** 停用时不测量布局，也不保留动画帧和尺寸观察。 */
  setActive(active: boolean): void {
    this.active = active;
    if (active && !this.closed) {
      this.layoutObserver?.observe(this.scroll);
      this.layoutObserver?.observe(this.article);
      this.invalidate();
    } else {
      this.stopOutlineSync();
      this.layoutObserver?.disconnect();
    }
  }
  /** 释放本模块注册的滚动、窗口与尺寸监听。 */
  dispose(): void {
    this.closed = true;
    this.setActive(false);
    this.scroll.removeEventListener('scroll', this.schedule);
    this.scroll.ownerDocument.defaultView?.removeEventListener('resize', this.invalidate);
    this.headingOffsets = undefined;
    this.outlineTarget = undefined;
  }
}
