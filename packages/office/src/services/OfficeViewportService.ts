import type { LayoutScheduler } from '../layout/LayoutScheduler';
import type { OfficeInteractionPort } from '../runtime/interactionTypes';
import { normalizeOfficeZoom } from '../runtime/normalizeOfficeZoom';
import { ObservableState } from './ObservableState';
export type OfficeOverflowAxis = 'horizontal' | 'vertical' | 'both';
let sequence = 0;
const VIEWPORT = '[data-office-fit-viewport="true"]';
const OVERFLOW = VIEWPORT + '[data-office-overflow-viewport="true"]';
/** 复用格式视图公开的基础尺寸，统一管理缩放和溢出提示的测量、观察及用户消隐。 */
export class OfficeViewportService {
  private state = new ObservableState<{ overflowAxis?: OfficeOverflowAxis }>(
    {},
  );
  private closed = false;
  private dismissed = false;
  private revision = '';
  private key = 'office-viewport-' + ++sequence;
  private cancel?: () => void;
  private resize?: ResizeObserver;
  private mutation?: MutationObserver;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private unsubscribe: () => void;
  getSnapshot = this.state.getSnapshot;
  subscribe = this.state.subscribe;
  constructor(
    private readonly container: HTMLElement,
    private readonly port: OfficeInteractionPort,
    private readonly scheduler: LayoutScheduler,
  ) {
    const window = container.ownerDocument.defaultView;
    if (window?.ResizeObserver)
      this.resize = new window.ResizeObserver(this.schedule);
    if (window?.MutationObserver) {
      this.mutation = new window.MutationObserver(this.refresh);
      this.mutation.observe(container, { childList: true, subtree: true });
    }
    for (const event of ['wheel', 'touchstart', 'pointerdown'])
      container.addEventListener(event, this.dismiss, { passive: true });
    container.addEventListener('keydown', this.keyDown);
    window?.addEventListener('resize', this.schedule);
    this.unsubscribe = port.subscribe(this.sync);
    this.sync();
    this.refresh();
  }
  private dismiss = (event: Event) => {
    const target = event.target as Element | null;
    if (target?.closest?.(OVERFLOW)) {
      this.dismissed = true;
      this.state.update({ overflowAxis: undefined });
    }
  };
  private keyDown = (event: KeyboardEvent) => {
    if (
      [
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'End',
        'Home',
        'PageDown',
        'PageUp',
        ' ',
      ].includes(event.key)
    )
      this.dismiss(event);
  };
  private sync = () => {
    const state = this.port.getState();
    const key = [
      state.active,
      state.zoom,
      state.zoomMode,
      state.activeIndex,
      state.activeSheetId,
      state.pageIndex,
      state.sheetMode,
      state.revisionMode,
    ].join(':');
    if (key === this.revision) return;
    this.revision = key;
    this.dismissed = false;
    this.state.update({ overflowAxis: undefined });
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (state.active) {
      this.schedule();
      this.timers = [
        setTimeout(this.schedule, 80),
        setTimeout(this.schedule, 240),
      ];
    } else this.cancel?.();
  };
  private refresh = () => {
    if (this.closed) return;
    this.resize?.disconnect();
    this.resize?.observe(this.container);
    this.container
      .querySelectorAll(VIEWPORT + ', [data-office-fit-target="true"]')
      .forEach((element) => this.resize?.observe(element));
    this.schedule();
  };
  private schedule = () => {
    if (this.closed || !this.port.getState().active) return;
    this.cancel = this.scheduler.schedule(this.key, this.measure, (result) => {
      if (this.closed) return;
      if (result.zoom !== undefined)
        this.port.updateFitZoom(result.mode, result.zoom);
      this.state.update({
        overflowAxis: this.dismissed ? undefined : result.overflowAxis,
      });
    });
  };
  private measure = () => {
    const state = this.port.getState();
    let zoom: number | undefined;
    let overflowAxis: OfficeOverflowAxis | undefined;
    const viewport = this.container.querySelector<HTMLElement>(VIEWPORT),
      target = this.container.querySelector<HTMLElement>(
        '[data-office-fit-target="true"]',
      );
    if (state.zoomMode !== 'percentage' && viewport && target) {
      const number = (key: string) => {
        const value = Number(target.dataset[key]);
        return Number.isFinite(value) && value > 0 ? value : 0;
      };
      const w = number('officeFitBaseWidth'),
        h = number('officeFitBaseHeight');
      const style =
        viewport.ownerDocument.defaultView?.getComputedStyle(viewport);
      const padding = (value?: string) => Number.parseFloat(value ?? '0') || 0;
      if (w && h && viewport.getClientRects().length) {
        const width =
          viewport.clientWidth -
          padding(style?.paddingLeft) -
          padding(style?.paddingRight) -
          number('officeFitFixedWidth');
        const height =
          viewport.clientHeight -
          padding(style?.paddingTop) -
          padding(style?.paddingBottom) -
          number('officeFitFixedHeight');
        // 隐藏或尚未分配有效空间时保留比例，等待观察器在布局就绪后重新测量。
        if (width > 0 && height > 0) {
          const raw =
            state.zoomMode === 'fit-page' && state.family !== 'spreadsheet'
              ? Math.min(width / w, height / h) * 100
              : (width / w) * 100;
          if (Number.isFinite(raw)) zoom = normalizeOfficeZoom(Math.floor(raw));
        }
      }
    } else if (state.zoomMode === 'percentage')
      this.container
        .querySelectorAll<HTMLElement>(OVERFLOW)
        .forEach((element) => {
          if (!element.getClientRects().length) return;
          const horizontal = element.scrollWidth > element.clientWidth + 2;
          const vertical =
            element.dataset.officeOverflowVertical !== 'false' &&
            element.scrollHeight > element.clientHeight + 2;
          const next =
            horizontal && vertical
              ? 'both'
              : horizontal
              ? 'horizontal'
              : vertical
              ? 'vertical'
              : undefined;
          if (next)
            overflowAxis =
              overflowAxis && overflowAxis !== next ? 'both' : next;
        });
    return { mode: state.zoomMode, zoom, overflowAxis };
  };
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe();
    this.cancel?.();
    this.timers.forEach(clearTimeout);
    this.resize?.disconnect();
    this.mutation?.disconnect();
    for (const event of ['wheel', 'touchstart', 'pointerdown'])
      this.container.removeEventListener(event, this.dismiss);
    this.container.removeEventListener('keydown', this.keyDown);
    this.container.ownerDocument.defaultView?.removeEventListener(
      'resize',
      this.schedule,
    );
    this.state.dispose();
  }
}
