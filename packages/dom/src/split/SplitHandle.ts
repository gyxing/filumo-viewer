import { useStyles } from '../styles';
import type { SplitHandleOptions } from './types';
import '../split.less';
// 分隔条预留 6px 命中区域，两侧最小宽度保证代码和结构仍可阅读。
const HANDLE_WIDTH = 6;

let nextHandleId = 0;

/** 管理两栏的原生拖动与键盘调宽，不重建内容视图。 */
export class SplitHandle {
  readonly element: HTMLElement;
  private width = 0;
  private active = true;
  private release: () => void;
  private visible = false;
  private en = false;
  private ratio?: number;
  private sourceWidth = 0;
  private frame?: number;
  private pending?: number;
  private drag?: { id: number; x: number; source: number };
  private closed = false;

  constructor(private panes: HTMLElement, private options: SplitHandleOptions) {
    const source = options.first;
    this.ratio = options.defaultRatio;
    this.release = useStyles('dom', panes.ownerDocument, options.stylePolicy);
    this.element = panes.ownerDocument.createElement('div');
    this.element.className = 'fivo-split-handle';
    this.element.hidden = true;
    this.element.tabIndex = 0;
    this.element.setAttribute('role', 'separator');
    this.element.setAttribute('aria-orientation', 'vertical');
    if (!source.id) source.id = 'fivo-split-source-' + ++nextHandleId;
    this.element.setAttribute('aria-controls', source.id);
    this.element.addEventListener('pointerdown', this.pointerDown);
    this.element.addEventListener('pointermove', this.pointerMove);
    this.element.addEventListener('pointerup', this.pointerUp);
    this.element.addEventListener('pointercancel', this.pointerCancel);
    this.element.addEventListener('lostpointercapture', this.pointerCancel);
    this.element.addEventListener('keydown', this.keyDown);
    this.element.addEventListener('dblclick', this.reset);
  }

  private get window() {
    return this.panes.ownerDocument.defaultView;
  }
  private get available() {
    return Math.max(0, this.width - HANDLE_WIDTH);
  }
  private clamp(source: number) {
    return Math.min(
      this.available - this.options.minSecond,
      Math.max(this.options.minFirst, source),
    );
  }
  private render() {
    if (!this.visible || this.closed || !this.active) return;
    const available = this.available;
    // 默认平分扣除分隔条后的空间，手动调整后保留用户比例。
    this.sourceWidth = this.clamp(available * (this.ratio ?? 0.5));
    this.options.onResize(this.sourceWidth, available - this.sourceWidth);
    const percent = (width: number) =>
      String(Math.round((width / available) * 1000) / 10);
    const source = percent(this.sourceWidth),
      tree = percent(available - this.sourceWidth);
    this.element.setAttribute('aria-valuemin', percent(this.options.minFirst));
    this.element.setAttribute(
      'aria-valuemax',
      percent(available - this.options.minSecond),
    );
    this.element.setAttribute('aria-valuenow', source);
    this.element.setAttribute(
      'aria-valuetext',
      this.en
        ? `Source ${source}%, structure ${tree}%`
        : `原文 ${source}%，结构 ${tree}%`,
    );
  }

  /** 容器变化时重新限制实际宽度，保留用户比例供后续恢复。 */
  update(width: number, visible: boolean, locale?: 'zh-CN' | 'en-US') {
    const en = locale === 'en-US';
    if (this.closed) return;
    const shown =
      visible &&
      width >= this.options.minFirst + this.options.minSecond + HANDLE_WIDTH;
    if (width !== this.width || shown !== this.visible) this.endDrag();
    this.width = width;
    this.visible = shown;
    this.en = en;
    this.element.hidden = !shown || !this.active;
    this.element.setAttribute(
      'aria-label',
      en ? 'Resize source and structure' : '调整原文和结构的宽度',
    );
    this.element.title = en
      ? 'Drag or use arrow keys to resize; double-click to reset'
      : '拖动或使用左右方向键调整，双击恢复默认比例';
    this.render();
  }

  private flush = () => {
    this.frame = undefined;
    if (this.pending === undefined) return;
    this.ratio = this.clamp(this.pending) / this.available;
    this.pending = undefined;
    this.render();
  };
  private schedule(source: number) {
    // 仅点击分隔条不视为手动调宽，默认布局仍随容器自适应。
    if (source === this.sourceWidth && this.pending === undefined) return;
    this.pending = source;
    if (this.frame !== undefined) return;
    if (this.window) this.frame = this.window.requestAnimationFrame(this.flush);
    else this.flush();
  }
  private pointerDown = (event: PointerEvent) => {
    if (
      !this.visible ||
      !this.active ||
      this.closed ||
      this.drag ||
      event.button !== 0 ||
      !event.isPrimary
    )
      return;
    event.preventDefault();
    this.element.focus({ preventScroll: true });
    this.element.setPointerCapture(event.pointerId);
    this.drag = {
      id: event.pointerId,
      x: event.clientX,
      source: this.sourceWidth,
    };
    this.panes.dataset.resizing = 'true';
    this.window?.addEventListener('blur', this.endDrag);
  };
  private pointerMove = (event: PointerEvent) => {
    if (!this.drag || event.pointerId !== this.drag.id) return;
    event.preventDefault();
    this.schedule(this.drag.source + (event.clientX - this.drag.x));
  };
  private pointerUp = (event: PointerEvent) => {
    if (!this.drag || event.pointerId !== this.drag.id) return;
    this.pointerMove(event);
    this.endDrag();
  };
  private pointerCancel = (event: PointerEvent) => {
    if (event.pointerId === this.drag?.id) this.endDrag();
  };
  private endDrag = () => {
    if (this.frame !== undefined) this.window?.cancelAnimationFrame(this.frame);
    this.flush();
    const drag = this.drag;
    this.drag = undefined;
    delete this.panes.dataset.resizing;
    this.window?.removeEventListener('blur', this.endDrag);
    if (drag && this.element.hasPointerCapture(drag.id))
      this.element.releasePointerCapture(drag.id);
  };
  private keyDown = (event: KeyboardEvent) => {
    if (!this.visible || this.closed) return;
    const step = event.shiftKey ? 50 : 10;
    let source: number;
    switch (event.key) {
      case 'ArrowLeft':
        source = this.sourceWidth - step;
        break;
      case 'ArrowRight':
        source = this.sourceWidth + step;
        break;
      case 'Home':
        source = this.options.minFirst;
        break;
      case 'End':
        source = this.available - this.options.minSecond;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.endDrag();
    this.pending = source;
    this.flush();
  };
  private reset = () => {
    if (!this.visible || this.closed) return;
    this.endDrag();
    this.ratio = undefined;
    this.render();
  };

  /** 返回用户比例，未手动调整时保持默认。 */
  getRatio(): number {
    return this.ratio ?? this.options.defaultRatio ?? 0.5;
  }
  /** 暂停时释放捕获与排队帧，恢复不重置比例。 */
  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.endDrag();
    this.element.hidden = !active || !this.visible;
    if (active) this.render();
  }
  /** 停止捕获和排队的更新，避免隐藏或销毁后继续写入布局。 */
  dispose() {
    if (this.closed) return;
    this.endDrag();
    this.closed = true;
    this.element.removeEventListener('pointerdown', this.pointerDown);
    this.element.removeEventListener('pointermove', this.pointerMove);
    this.element.removeEventListener('pointerup', this.pointerUp);
    this.element.removeEventListener('pointercancel', this.pointerCancel);
    this.element.removeEventListener('lostpointercapture', this.pointerCancel);
    this.element.removeEventListener('keydown', this.keyDown);
    this.element.removeEventListener('dblclick', this.reset);
    this.element.remove();
    this.release();
  }
}
