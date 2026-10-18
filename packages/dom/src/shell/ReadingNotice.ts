import { createShellIcon, labelShellButton } from './icons';

// 保留足够阅读时间；悬停或键盘焦点停留期间不自动关闭。
const NOTICE_DURATION = 6000;

/** 阅读区内的单条非阻塞提示，按事件编号去重并独立管理计时资源。 */
export function createReadingNotice(document: Document, returnFocus: () => void) {
  const element = document.createElement('div');
  element.className = 'fivo-reading-notice';
  element.hidden = true;
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  element.setAttribute('aria-atomic', 'true');
  const message = document.createElement('span');
  message.className = 'fivo-reading-notice-message';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'fivo-reading-notice-close';
  element.append(createShellIcon(document, 'error'), message, close);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let shown: number | undefined;
  let remaining = NOTICE_DURATION;
  let started = 0;
  let hovered = false, focused = false, active = true, closed = false;
  const pause = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    remaining = Math.max(0, remaining - (Date.now() - started));
  };
  const dismiss = () => {
    pause();
    element.hidden = true;
    hovered = false;
    focused = false;
  };
  const resume = () => {
    if (closed || !active || hovered || focused || element.hidden || timer !== undefined) return;
    started = Date.now();
    timer = setTimeout(() => { timer = undefined; dismiss(); }, remaining);
  };
  close.onclick = () => {
    const restore = document.activeElement === close;
    dismiss();
    if (restore) returnFocus();
  };
  element.onpointerenter = () => { hovered = true; pause(); };
  element.onpointerleave = () => { hovered = false; resume(); };
  element.addEventListener('focusin', () => { focused = true; pause(); });
  element.addEventListener('focusout', (event) => {
    focused = element.contains(event.relatedTarget as Node | null);
    resume();
  });
  return {
    element,
    update(id: number | undefined, text: string | undefined, locale?: 'zh-CN' | 'en-US') {
      if (closed) return;
      const label = locale === 'en-US' ? 'Dismiss notification' : '关闭提示';
      if (close.getAttribute('aria-label') !== label)
        labelShellButton(close, label, 'close', true);
      if (id === undefined || !text) {
        shown = undefined;
        dismiss();
        return;
      }
      if (message.textContent !== text) message.textContent = text;
      // 关闭或到期后，缩放、语言和能力刷新不能重新弹出同一次提示。
      if (id === shown) return;
      pause();
      shown = id;
      remaining = NOTICE_DURATION;
      element.hidden = false;
      hovered = element.matches?.(':hover') ?? false;
      focused = element.contains(document.activeElement);
      resume();
    },
    setActive(value: boolean) {
      active = value;
      if (value) {
        hovered = element.matches?.(':hover') ?? false;
        focused = element.contains(document.activeElement);
        resume();
      }
      else pause();
    },
    dispose() {
      closed = true;
      dismiss();
      element.remove();
    },
  };
}
