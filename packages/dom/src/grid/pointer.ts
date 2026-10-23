import type { GridPoint } from './contracts';
import type { GridTextSelection } from './textSelection';

/** 网格之外的交互控件保留原事件，图片双击和列宽手柄不会启动拖选。 */
export function gridInteractiveTarget(target: EventTarget | null): boolean {
  return !!(target as Element | null)?.closest?.(
    'a,button,input,textarea,select,img,[contenteditable="true"],[role="link"],[role="separator"],[data-grid-interactive]',
  );
}

/** 稳定视口持有捕获，几何命中不依赖虚拟单元格是否已进入 DOM。 */
export class GridPointer {
  private drag?: { id: number; x: number; y: number };
  private tap?: { id: number; x: number; y: number };
  private frame?: number;
  constructor(
    private host: HTMLElement,
    private hit: (
      x: number,
      y: number,
      clamp: boolean,
    ) => GridPoint | undefined,
    private select: (
      point: GridPoint,
      extend: boolean,
      nativeText?: boolean,
    ) => void,
    private text?: GridTextSelection,
  ) {
    host.addEventListener('pointerdown', this.down);
    host.addEventListener('pointermove', this.move);
    host.addEventListener('pointerup', this.up);
    host.addEventListener('pointercancel', this.cancel);
    host.addEventListener('lostpointercapture', this.cancel);
  }
  private down = (event: PointerEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      !event.isPrimary ||
      gridInteractiveTarget(event.target)
    )
      return;
    const point = this.hit(event.clientX, event.clientY, false);
    if (!point) return;
    if (event.pointerType === 'touch') {
      this.tap = { id: event.pointerId, x: event.clientX, y: event.clientY };
      return;
    }
    if (!event.shiftKey && this.text?.begin(event)) {
      this.select(point, false, true);
      return;
    }
    this.text?.clear();
    event.preventDefault();
    this.host.focus({ preventScroll: true });
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    this.host.setPointerCapture?.(event.pointerId);
    this.select(point, event.shiftKey);
  };
  private move = (event: PointerEvent) => {
    if (
      this.tap?.id === event.pointerId &&
      Math.hypot(event.clientX - this.tap.x, event.clientY - this.tap.y) > 8
    )
      this.tap = undefined;
    if (this.drag?.id !== event.pointerId) return;
    this.drag.x = event.clientX;
    this.drag.y = event.clientY;
    const point = this.hit(event.clientX, event.clientY, true);
    if (point) this.select(point, true);
    this.startScroll();
  };
  private startScroll() {
    if (this.frame !== undefined || !this.drag) return;
    const window = this.host.ownerDocument.defaultView;
    if (!window) return;
    this.frame = window.requestAnimationFrame(() => {
      this.frame = undefined;
      if (!this.drag) return;
      const rect = this.host.getBoundingClientRect();
      const speed = (value: number, min: number, max: number) =>
        value < min + 24
          ? -Math.min(28, Math.max(1, (min + 24 - value) / 2))
          : value > max - 24
          ? Math.min(28, Math.max(1, (value - max + 24) / 2))
          : 0;
      const left = this.host.scrollLeft,
        top = this.host.scrollTop;
      this.host.scrollLeft += speed(this.drag.x, rect.left, rect.right);
      this.host.scrollTop += speed(this.drag.y, rect.top, rect.bottom);
      if (left !== this.host.scrollLeft || top !== this.host.scrollTop) {
        const point = this.hit(this.drag.x, this.drag.y, true);
        if (point) this.select(point, true);
        this.startScroll();
      }
    });
  }
  private up = (event: PointerEvent) => {
    if (this.tap?.id !== event.pointerId && this.drag?.id !== event.pointerId)
      return;
    if (this.tap?.id === event.pointerId) {
      if (this.text?.active) {
        this.cancel();
        return;
      }
      const point = this.hit(event.clientX, event.clientY, false);
      if (point) {
        this.host.focus({ preventScroll: true });
        this.select(point, false);
      }
    }
    this.cancel();
  };
  /** 隐藏与销毁都走同一取消路径，避免残留自动滚动。 */
  cancel = () => {
    const drag = this.drag;
    this.drag = this.tap = undefined;
    if (drag && this.host.hasPointerCapture?.(drag.id))
      this.host.releasePointerCapture(drag.id);
    if (this.frame !== undefined)
      this.host.ownerDocument.defaultView?.cancelAnimationFrame(this.frame);
    this.frame = undefined;
  };
  dispose(): void {
    this.cancel();
    this.host.removeEventListener('pointerdown', this.down);
    this.host.removeEventListener('pointermove', this.move);
    this.host.removeEventListener('pointerup', this.up);
    this.host.removeEventListener('pointercancel', this.cancel);
    this.host.removeEventListener('lostpointercapture', this.cancel);
  }
}
