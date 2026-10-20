/** 捕获属于稳定的表头，重绘可见列不会中断正在进行的调宽。 */
export class CsvColumnResize {
  private drag?: { id: number; column: number; x: number; width: number };
  private active = true;
  constructor(
    private header: HTMLElement,
    private width: (column: number) => number,
    private change: (column: number, width: number) => void,
  ) {
    header.addEventListener('pointerdown', this.down);
    header.addEventListener('pointermove', this.move);
    header.addEventListener('pointerup', this.end);
    header.addEventListener('pointercancel', this.end);
    header.addEventListener('lostpointercapture', this.end);
    header.addEventListener('keydown', this.key);
  }
  private down = (event: PointerEvent) => {
    if (!this.active) return;
    const handle = (event.target as Element).closest<HTMLElement>(
      '[data-resize-column]',
    );
    if (!handle || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    event.stopPropagation();
    const column = Number(handle.dataset.resizeColumn);
    this.drag = {
      id: event.pointerId,
      column,
      x: event.clientX,
      width: this.width(column),
    };
    this.header.setPointerCapture(event.pointerId);
  };
  private move = (event: PointerEvent) => {
    if (this.drag?.id === event.pointerId)
      this.change(
        this.drag.column,
        this.drag.width + event.clientX - this.drag.x,
      );
  };
  private end = (event: PointerEvent) => {
    if (this.drag?.id !== event.pointerId) return;
    this.drag = undefined;
    if (this.header.hasPointerCapture(event.pointerId))
      this.header.releasePointerCapture(event.pointerId);
  };
  private key = (event: KeyboardEvent) => {
    if (!this.active) return;
    const handle = (event.target as Element).closest<HTMLElement>(
      '[data-resize-column]',
    );
    if (!handle || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const column = Number(handle.dataset.resizeColumn);
    this.change(
      column,
      this.width(column) + (event.key === 'ArrowLeft' ? -16 : 16),
    );
  };
  /** 隐藏表格时释放捕获，恢复后保留已提交列宽。 */
  setActive(active: boolean): void {
    this.active = active;
    if (!active && this.drag)
      this.end({ pointerId: this.drag.id } as PointerEvent);
  }
  dispose(): void {
    this.setActive(false);
    this.header.removeEventListener('pointerdown', this.down);
    this.header.removeEventListener('pointermove', this.move);
    this.header.removeEventListener('pointerup', this.end);
    this.header.removeEventListener('pointercancel', this.end);
    this.header.removeEventListener('lostpointercapture', this.end);
    this.header.removeEventListener('keydown', this.key);
  }
}
