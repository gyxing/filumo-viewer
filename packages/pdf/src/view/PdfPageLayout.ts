import type { PdfPageMetrics } from '../runtime/contracts';
export interface PdfAnchor {
  pageIndex: number;
  ratio: number;
}
/** 页高度使用前缀树索引；滚动查找和单页尺寸修正不遍历全文。 */
export class PdfPageLayout {
  private metrics = new Map<number, PdfPageMetrics>();
  private heights: Float64Array;
  private tree: Float64Array;
  private scale = 1;
  private rotation = 0;
  private widest = 0;
  private tallest = 0;
  constructor(
    readonly count: number,
    private estimate: PdfPageMetrics,
    readonly gap = 16,
  ) {
    this.heights = new Float64Array(count);
    this.tree = new Float64Array(count + 1);
    this.widest = estimate.width;
    this.tallest = estimate.height;
    for (let index = 0; index < count; index++)
      this.setHeight(index, estimate.height);
  }
  private setHeight(index: number, height: number) {
    const delta = height - this.heights[index];
    this.heights[index] = height;
    for (let at = index + 1; at < this.tree.length; at += at & -at)
      this.tree[at] += delta;
  }
  private sum(end: number) {
    let sum = 0;
    for (let at = end; at > 0; at -= at & -at) sum += this.tree[at];
    return sum;
  }
  setMetrics(index: number, metrics: PdfPageMetrics): void {
    if (
      index < 0 ||
      index >= this.count ||
      !Number.isFinite(metrics.width + metrics.height) ||
      metrics.width <= 0 ||
      metrics.height <= 0
    )
      return;
    this.metrics.set(index, metrics);
    // 同一文档的页面尺寸不变，滚动时直接读取已知最大值，避免遍历已测量页面。
    this.widest = Math.max(this.widest, metrics.width);
    this.tallest = Math.max(this.tallest, metrics.height);
    this.setHeight(index, this.rotation % 180 ? metrics.width : metrics.height);
  }
  setScale(scale: number): void {
    if (Number.isFinite(scale) && scale > 0) this.scale = scale;
  }
  setRotation(degrees: number): void {
    this.rotation = ((degrees % 360) + 360) % 360;
    for (let index = 0; index < this.count; index++) {
      const value = this.metrics.get(index) ?? this.estimate;
      this.setHeight(index, this.rotation % 180 ? value.width : value.height);
    }
  }
  getSize(index: number): { width: number; height: number } {
    const value = this.metrics.get(index) ?? this.estimate;
    return {
      width: (this.rotation % 180 ? value.height : value.width) * this.scale,
      height: this.heights[index] * this.scale,
    };
  }
  maxWidth(): number {
    return (this.rotation % 180 ? this.tallest : this.widest) * this.scale;
  }
  offsetOf(index: number): number {
    return (
      this.gap +
      this.sum(Math.max(0, Math.min(index, this.count))) * this.scale +
      index * this.gap
    );
  }
  totalHeight(): number {
    return this.sum(this.count) * this.scale + this.gap * (this.count + 1);
  }
  findPage(top: number): number {
    let low = 0,
      high = this.count;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.offsetOf(middle) + this.getSize(middle).height <= top)
        low = middle + 1;
      else high = middle;
    }
    return Math.max(0, Math.min(this.count - 1, low));
  }
  captureAnchor(top: number): PdfAnchor {
    const pageIndex = this.findPage(top);
    return {
      pageIndex,
      ratio:
        (top - this.offsetOf(pageIndex)) /
        Math.max(1, this.getSize(pageIndex).height),
    };
  }
  /** 阅读线略低于视口顶边，标题进入正文后即可切换；到底时覆盖最后一页。 */
  captureReadingPosition(top: number, height: number): PdfAnchor {
    const viewportHeight = Math.max(1, height);
    if (top > 0 && top + viewportHeight >= this.totalHeight() - 1)
      return { pageIndex: Math.max(0, this.count - 1), ratio: 1 };
    const anchor = this.captureAnchor(
      top + Math.min(48, viewportHeight * 0.15),
    );
    return {
      pageIndex: anchor.pageIndex,
      ratio: Math.max(0, Math.min(1, anchor.ratio)),
    };
  }
  restoreAnchor(anchor: PdfAnchor): number {
    return Math.max(
      0,
      this.offsetOf(anchor.pageIndex) +
        anchor.ratio * this.getSize(anchor.pageIndex).height,
    );
  }
}
