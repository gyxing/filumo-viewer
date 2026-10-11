import { ObservableState } from '../services/ObservableState';
import type { LayoutScheduler } from './LayoutScheduler';
let sequence = 0;
/** 在所属文档内观察视口，几何读取进入统一布局调度；停用不丢弃快照。 */
export class ViewportObserver {
  private state = new ObservableState({
    width: 0,
    height: 0,
    scrollTop: 0,
    scrollLeft: 0,
  });
  private active = true;
  private closed = false;
  private resize?: ResizeObserver;
  private cancel?: () => void;
  private key = 'viewport-' + ++sequence;
  getSnapshot = this.state.getSnapshot;
  subscribe = this.state.subscribe;
  constructor(
    private readonly element: HTMLElement,
    private readonly scheduler: LayoutScheduler,
  ) {
    const Resize = element.ownerDocument.defaultView?.ResizeObserver;
    if (Resize) {
      this.resize = new Resize(this.schedule);
      this.resize.observe(element);
    }
    element.addEventListener('scroll', this.schedule, { passive: true });
    this.schedule();
  }
  private schedule = () => {
    if (this.closed || !this.active) return;
    this.cancel = this.scheduler.schedule(
      this.key,
      () => ({
        width: this.element.clientWidth,
        height: this.element.clientHeight,
        scrollTop: this.element.scrollTop,
        scrollLeft: this.element.scrollLeft,
      }),
      (value) => this.state.update(value),
    );
  };
  setActive(active: boolean) {
    this.active = active;
    if (active) this.schedule();
    else this.cancel?.();
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.cancel?.();
    this.resize?.disconnect();
    this.element.removeEventListener('scroll', this.schedule);
    this.state.dispose();
  }
}
