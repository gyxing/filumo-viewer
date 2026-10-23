/** 只命中真实文字行框，单元格的内边距和空白仍用于矩形框选。 */
export function gridTextCellAtPoint(
  host: HTMLElement,
  event: Pick<PointerEvent, 'target' | 'clientX' | 'clientY'>,
): HTMLElement | undefined {
  const cell = (event.target as Element | null)?.closest?.<HTMLElement>(
    '[data-grid-row][data-grid-column]',
  );
  if (!cell || !host.contains(cell)) return;
  const document = host.ownerDocument;
  // SHOW_TEXT 的固定值为 4，不依赖宿主窗口之外的 NodeFilter 实例。
  const walker = document.createTreeWalker(cell, 4);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    range.selectNodeContents(node);
    for (const rect of range.getClientRects())
      if (
        event.clientX >= rect.left &&
        event.clientX < rect.right &&
        event.clientY >= rect.top &&
        event.clientY < rect.bottom
      )
        return cell;
  }
}

/** 原生选字仅保留涉及的节点，不阻止虚拟窗口继续更新其他单元格。 */
export class GridTextSelection {
  private pointer?: number;
  private startCell?: HTMLElement;
  private enabled = true;
  private announced = false;
  constructor(
    private host: HTMLElement,
    private changed: (active: boolean) => void,
  ) {
    const document = host.ownerDocument;
    document.addEventListener('selectionchange', this.refresh);
    document.addEventListener('pointerup', this.end, true);
    document.addEventListener('pointercancel', this.end, true);
  }
  private selection(): Selection | undefined {
    const selection = this.host.ownerDocument.getSelection();
    return selection &&
      !selection.isCollapsed &&
      selection.rangeCount &&
      this.host.contains(selection.anchorNode) &&
      this.host.contains(selection.focusNode)
      ? selection
      : undefined;
  }
  get active(): boolean {
    return this.enabled && (this.pointer !== undefined || !!this.selection());
  }
  /** 从文字开始时交还默认鼠标行为，不捕获指针，不模拟浏览器文字选区。 */
  begin(event: PointerEvent): boolean {
    if (!this.enabled) return false;
    const cell = gridTextCellAtPoint(this.host, event);
    if (!cell) return false;
    this.pointer = event.pointerId;
    this.startCell = cell;
    this.refresh();
    return true;
  }
  /** 重绘只保留当前文字范围涉及的节点，空选区或其他查看器不参与。 */
  preserves(node: Node): boolean {
    if (!this.enabled) return false;
    return (
      !!(
        this.startCell &&
        (node === this.startCell || node.contains(this.startCell))
      ) || !!this.selection()?.containsNode(node, true)
    );
  }
  private end = (event: PointerEvent) => {
    if (event.pointerId !== this.pointer) return;
    this.pointer = undefined;
    this.startCell = undefined;
    this.refresh();
  };
  private refresh = () => {
    const active = this.active;
    if (active === this.announced) return;
    this.announced = active;
    this.changed(active);
  };
  /** 导航、编码或尺寸切换时只清理本查看器的原生选择，不影响页面其他文本。 */
  clear(): void {
    this.pointer = undefined;
    this.startCell = undefined;
    this.selection()?.removeAllRanges();
    this.refresh();
  }
  setActive(active: boolean): void {
    if (!active) this.clear();
    this.enabled = active;
    this.refresh();
  }
  dispose(): void {
    this.setActive(false);
    const document = this.host.ownerDocument;
    document.removeEventListener('selectionchange', this.refresh);
    document.removeEventListener('pointerup', this.end, true);
    document.removeEventListener('pointercancel', this.end, true);
  }
}
