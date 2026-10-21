import type { LayoutScheduler } from '../../layout/LayoutScheduler';
/** 原生侧栏保留原 200～520px、工作区 45% 的宽度约束；拖拽和键盘写入合并到布局调度。 */
export function mountSidebarResize(
  panel: HTMLElement,
  direction: 'left' | 'right',
  layout: LayoutScheduler,
  label: string,
  onResize: () => void = () => {},
) {
  const handle = panel.ownerDocument.createElement('div');
  handle.className = 'filumo-native-resize filumo-native-resize--' + direction;
  handle.tabIndex = 0;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', label);
  panel.append(handle);
  let width = 260,
    closed = false,
    cancel: (() => void) | undefined,
    drag: { id: number; x: number; width: number } | undefined;
  const key = 'resize-' + Math.random().toString(36).slice(2);
  const set = (value: number) => {
    cancel = layout.schedule(
      key,
      () =>
        Math.max(
          200,
          Math.min(520, (panel.parentElement?.clientWidth ?? 1155) * 0.45),
        ),
      (max) => {
        if (closed) return;
        width = Math.max(200, Math.min(max, value));
        panel.style.flexBasis = width + 'px';
        panel.style.width = width + 'px';
        handle.setAttribute('aria-valuemin', '200');
        handle.setAttribute('aria-valuemax', String(Math.round(max)));
        handle.setAttribute('aria-valuenow', String(Math.round(width)));
        onResize();
      },
    );
  };
  handle.onpointerdown = (event) => {
    drag = { id: event.pointerId, x: event.clientX, width };
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  handle.onpointermove = (event) => {
    if (drag?.id === event.pointerId)
      set(
        drag.width +
          (event.clientX - drag.x) * (direction === 'right' ? 1 : -1),
      );
  };
  const finish = (event: PointerEvent) => {
    if (drag?.id !== event.pointerId) return;
    drag = undefined;
    if (handle.hasPointerCapture(event.pointerId))
      handle.releasePointerCapture(event.pointerId);
  };
  handle.onpointerup = finish;
  handle.onpointercancel = finish;
  handle.onkeydown = (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      set(
        width +
          (event.key === 'ArrowRight' ? 20 : -20) *
            (direction === 'right' ? 1 : -1),
      );
    }
  };
  const Resize = panel.ownerDocument.defaultView?.ResizeObserver;
  const observer = Resize ? new Resize(() => set(width)) : undefined;
  if (panel.parentElement) observer?.observe(panel.parentElement);
  else
    queueMicrotask(() => {
      if (!closed && panel.parentElement)
        observer?.observe(panel.parentElement);
    });
  const resize = () => set(width);
  panel.ownerDocument.defaultView?.addEventListener('resize', resize);
  set(width);
  return {
    setLabel(value: string) {
      handle.setAttribute('aria-label', value);
    },
    dispose() {
      closed = true;
      cancel?.();
      observer?.disconnect();
      panel.ownerDocument.defaultView?.removeEventListener('resize', resize);
      handle.remove();
    },
  };
}
