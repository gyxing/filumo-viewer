// 沿用 DOCX 宽度范围，窄容器额外为正文保留至少 120px。
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 520;

/** 侧栏只调整自身宽度，事件和尺寸观察随 Markdown 视图释放。 */
export class OutlineResize {
  readonly element: HTMLElement;
  private preferred = DEFAULT_WIDTH;
  private width = DEFAULT_WIDTH;
  private active = true;
  private closed = false;
  private observer?: ResizeObserver;
  private frame?: number;
  private drag?: { id: number; x: number; width: number };
  constructor(private panel: HTMLElement, en: boolean) {
    this.element = panel.ownerDocument.createElement('div');
    this.element.className = 'fivo-markdown-outline-resize';
    this.element.tabIndex = 0;
    this.element.setAttribute('role', 'separator');
    this.element.setAttribute('aria-orientation', 'vertical');
    this.element.setAttribute(
      'aria-label',
      en ? 'Resize outline' : '调整大纲宽度',
    );
    this.element.addEventListener('pointerdown', this.down);
    this.element.addEventListener('pointermove', this.move);
    this.element.addEventListener('pointerup', this.up);
    this.element.addEventListener('pointercancel', this.cancel);
    this.element.addEventListener('lostpointercapture', this.cancel);
    this.element.addEventListener('keydown', this.key);
    this.window?.addEventListener('resize', this.schedule);
    const Observer = this.window?.ResizeObserver;
    if (Observer) this.observer = new Observer(this.schedule);
    panel.append(this.element);
  }
  private get window() {
    return this.panel.ownerDocument.defaultView;
  }
  private bounds() {
    const available = this.panel.parentElement?.clientWidth ?? 0;
    const max = Math.max(
      0,
      Math.min(MAX_WIDTH, available * 0.45, available - 120),
    );
    return { min: Math.min(MIN_WIDTH, max), max };
  }
  private refresh = () => {
    this.frame = undefined;
    if (!this.active || this.closed || this.panel.hidden) return;
    const { min, max } = this.bounds();
    if (!max) return;
    this.width = Math.max(min, Math.min(max, this.preferred));
    this.panel.style.flexBasis = this.width + 'px';
    this.element.setAttribute('aria-valuemin', String(Math.round(min)));
    this.element.setAttribute('aria-valuemax', String(Math.round(max)));
    this.element.setAttribute('aria-valuenow', String(Math.round(this.width)));
  };
  private schedule = () => {
    if (!this.active || this.closed || this.frame !== undefined) return;
    if (this.window) this.frame = this.window.requestAnimationFrame(this.refresh);
    else this.refresh();
  };
  private set(width: number) {
    const { min, max } = this.bounds();
    if (!max) return;
    this.preferred = Math.max(min, Math.min(max, width));
    this.schedule();
  }
  private down = (event: PointerEvent) => {
    if (
      !this.active || this.closed || this.drag ||
      event.button !== 0 || !event.isPrimary
    )
      return;
    event.preventDefault();
    this.element.focus({ preventScroll: true });
    this.element.setPointerCapture(event.pointerId);
    this.drag = { id: event.pointerId, x: event.clientX, width: this.width };
    this.panel.dataset.resizing = 'true';
    if (this.panel.parentElement)
      this.panel.parentElement.dataset.outlineResizing = 'true';
    this.window?.addEventListener('blur', this.finish);
  };
  private move = (event: PointerEvent) => {
    if (this.drag?.id !== event.pointerId) return;
    event.preventDefault();
    this.set(this.drag.width + (event.clientX - this.drag.x));
  };
  private up = (event: PointerEvent) => {
    if (this.drag?.id !== event.pointerId) return;
    this.move(event);
    this.finish();
  };
  private cancel = (event: PointerEvent) => {
    if (this.drag?.id === event.pointerId) this.finish();
  };
  private finish = () => {
    if (this.frame !== undefined) this.window?.cancelAnimationFrame(this.frame);
    this.refresh();
    const drag = this.drag;
    this.drag = undefined;
    delete this.panel.dataset.resizing;
    if (this.panel.parentElement)
      delete this.panel.parentElement.dataset.outlineResizing;
    this.window?.removeEventListener('blur', this.finish);
    if (drag && this.element.hasPointerCapture(drag.id))
      this.element.releasePointerCapture(drag.id);
  };
  private key = (event: KeyboardEvent) => {
    if (!this.active || this.closed) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    this.set(this.width + (event.key === 'ArrowRight' ? 20 : -20));
  };
  /** 结束拖动，恢复时重新按当前工作区限制宽度。 */
  setActive(active: boolean) {
    if (this.closed) return;
    this.finish();
    this.active = active;
    this.observer?.disconnect();
    if (active) {
      if (this.panel.parentElement)
        this.observer?.observe(this.panel.parentElement);
      this.schedule();
    }
  }
  /** 清理捕获、动画帧和尺寸观察。 */
  dispose() {
    if (this.closed) return;
    this.setActive(false);
    this.closed = true;
    this.window?.removeEventListener('resize', this.schedule);
    this.element.removeEventListener('pointerdown', this.down);
    this.element.removeEventListener('pointermove', this.move);
    this.element.removeEventListener('pointerup', this.up);
    this.element.removeEventListener('pointercancel', this.cancel);
    this.element.removeEventListener('lostpointercapture', this.cancel);
    this.element.removeEventListener('keydown', this.key);
    this.element.remove();
  }
}
