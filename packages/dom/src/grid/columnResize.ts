import type { GridColumnResizeOptions } from './contracts';

/** 列宽属于预览覆盖，稳定宿主持有捕获，取消时恢复拖动前值。 */
export class GridColumnResize {
  private drag?: {
    id: number;
    column: number;
    x: number;
    width: number;
    previous?: number;
  };
  private pending?: number;
  private frame?: number;
  private active = true;
  private keyboardColumn?: number;
  constructor(private options: GridColumnResizeOptions) {
    const host = options.host;
    host.addEventListener('pointerdown', this.down);
    host.addEventListener('pointermove', this.move);
    host.addEventListener('pointerup', this.up);
    host.addEventListener('pointercancel', this.cancel);
    host.addEventListener('lostpointercapture', this.cancel);
    host.addEventListener('keydown', this.key, true);
    host.addEventListener('focusout', this.blur);
  }
  private handle(target: EventTarget | null) {
    return (target as Element | null)?.closest?.<HTMLElement>(
      '[data-resize-column]',
    );
  }
  private down = (event: PointerEvent) => {
    this.keyboardColumn = undefined;
    const handle = this.handle(event.target);
    if (
      !this.active ||
      this.drag ||
      !handle ||
      !this.options.host.contains(handle) ||
      event.button !== 0 ||
      !event.isPrimary
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const column = Number(handle.dataset.resizeColumn);
    this.drag = {
      id: event.pointerId,
      column,
      x: event.clientX,
      width: this.options.width(column),
      previous: this.options.override(column),
    };
    if (this.options.host.tabIndex < 0) this.options.host.tabIndex = -1;
    this.options.host.focus({ preventScroll: true });
    this.options.host.setPointerCapture?.(event.pointerId);
    this.options.start?.();
  };
  private move = (event: PointerEvent) => {
    if (this.drag?.id !== event.pointerId) return;
    this.pending = Math.max(
      48,
      Math.min(
        1600,
        this.drag.width +
          (event.clientX - this.drag.x) / Math.max(0.01, this.options.scale()),
      ),
    );
    if (this.frame === undefined) {
      const window = this.options.host.ownerDocument.defaultView;
      if (window)
        this.frame = window.requestAnimationFrame(() => {
          this.frame = undefined;
          this.flush();
        });
      else this.flush();
    }
  };
  private flush() {
    if (this.drag && this.pending !== undefined)
      this.options.change(this.drag.column, this.pending);
    this.pending = undefined;
  }
  private finish(commit: boolean) {
    const drag = this.drag;
    if (!drag) return;
    if (commit) this.flush();
    this.drag = undefined;
    this.pending = undefined;
    if (!commit && this.options.override(drag.column) !== drag.previous)
      this.options.change(drag.column, drag.previous);
    const host = this.options.host;
    if (host.hasPointerCapture?.(drag.id)) host.releasePointerCapture(drag.id);
    if (this.frame !== undefined)
      host.ownerDocument.defaultView?.cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.options.end?.(commit);
  }
  private up = (event: PointerEvent) => {
    if (this.drag?.id === event.pointerId) this.finish(true);
  };
  private cancel = () => this.finish(false);
  private key = (event: KeyboardEvent) => {
    if (!this.active) return;
    if (this.drag && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.finish(false);
      return;
    }
    const handle = this.handle(event.target);
    if (!handle || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const column = Number(handle.dataset.resizeColumn);
    this.keyboardColumn = column;
    this.options.change(
      column,
      Math.max(
        48,
        Math.min(
          1600,
          this.options.width(column) + (event.key === 'ArrowLeft' ? -16 : 16),
        ),
      ),
    );
  };
  private blur = (event: FocusEvent) => {
    if (
      event.relatedTarget &&
      !(event.relatedTarget as Element).closest?.('[data-resize-column]')
    )
      this.keyboardColumn = undefined;
  };
  /** 表头虚拟化重绘后恢复键盘手柄，焦点离开时不抢回。 */
  refresh(): void {
    const host = this.options.host,
      document = host.ownerDocument,
      active = document.activeElement;
    if (
      this.active &&
      this.keyboardColumn !== undefined &&
      (!active || active === document.body || active === host)
    )
      host
        .querySelector<HTMLElement>(
          '[data-resize-column="' + this.keyboardColumn + '"]',
        )
        ?.focus({ preventScroll: true });
  }
  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.keyboardColumn = undefined;
      this.finish(false);
    }
  }
  dispose(): void {
    this.setActive(false);
    const host = this.options.host;
    host.removeEventListener('pointerdown', this.down);
    host.removeEventListener('pointermove', this.move);
    host.removeEventListener('pointerup', this.up);
    host.removeEventListener('pointercancel', this.cancel);
    host.removeEventListener('lostpointercapture', this.cancel);
    host.removeEventListener('keydown', this.key, true);
    host.removeEventListener('focusout', this.blur);
  }
}
