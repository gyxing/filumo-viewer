// 同一个预览器同时只打开一个选项面板，切换控件时避免弹层互相遮挡。
const activePopups = new WeakMap<Node, { close(): void }>();
let sequence = 0;

/** 为选择和缩放提供共享浮层，负责避让、主题继承、外部关闭和资源清理。 */
export function createOptionPopup(
  anchor: HTMLElement,
  owner: HTMLElement,
  onClose: () => void,
  options: { width?: number; align?: 'start' | 'end' } = {},
) {
  const document = owner.ownerDocument;
  const win = document.defaultView;
  const element = document.createElement('div');
  element.className = 'fivo-option-popup';
  element.id = 'fivo-option-popup-' + ++sequence;
  element.setAttribute('role', 'listbox');
  const nativePopover = typeof element.showPopover === 'function';
  if (nativePopover) element.setAttribute('popover', 'manual');
  element.hidden = true;
  owner.append(element);
  let opened = false,
    disposed = false;
  let scope: Node = document;
  const identity = { close: () => {} };
  const close = () => {
    if (!opened) return;
    opened = false;
    if (nativePopover && element.matches(':popover-open'))
      element.hidePopover();
    element.hidden = true;
    if (activePopups.get(scope) === identity) activePopups.delete(scope);
    onClose();
  };
  identity.close = close;
  const position = () => {
    if (!opened || !win) return;
    if (!owner.isConnected || !anchor.getClientRects().length) {
      close();
      return;
    }
    const bounds = owner.closest('.fivo-viewer')?.getBoundingClientRect();
    const box = anchor.getBoundingClientRect();
    const left = Math.max(4, bounds?.left ?? 0);
    const right = Math.min(win.innerWidth - 4, bounds?.right ?? win.innerWidth);
    const top = Math.max(4, bounds?.top ?? 0);
    const bottom = Math.min(
      win.innerHeight - 4,
      bounds?.bottom ?? win.innerHeight,
    );
    element.style.width = options.width ? options.width + 'px' : 'max-content';
    const natural =
      options.width ??
      Math.max(144, box.width, element.getBoundingClientRect().width);
    const width = Math.max(
      0,
      Math.min(natural, right - left, options.width ?? 260),
    );
    const below = bottom - box.bottom - 4;
    const above = below < 110 && box.top - top > below;
    const height = Math.max(
      28,
      Math.min(240, above ? box.top - top - 4 : below),
    );
    element.style.width = width + 'px';
    element.style.maxHeight = height + 'px';
    const x = options.align === 'end' ? box.right - width : box.left;
    element.style.left = Math.max(left, Math.min(x, right - width)) + 'px';
    element.style.top =
      (above
        ? box.top - element.getBoundingClientRect().height - 4
        : box.bottom + 4) + 'px';
  };
  const present = () => {
    element.hidden = false;
    if (
      nativePopover &&
      element.isConnected &&
      !element.matches(':popover-open')
    )
      element.showPopover();
    position();
  };
  const outside = (event: Event) => {
    if (!owner.contains(event.target as Node)) close();
  };
  const focus = (event: Event) => {
    if (!owner.contains(event.target as Node)) close();
    // 布局移动会移除并重新挂载节点，恢复焦点时也恢复原生顶层弹出状态。
    else if (opened) present();
  };
  const toggle = (event: Event) => {
    const details = event.target as HTMLDetailsElement | null;
    if (
      details?.localName === 'details' &&
      !details.open &&
      details.contains(owner)
    )
      close();
  };
  document.addEventListener('pointerdown', outside);
  document.addEventListener('focusin', focus);
  document.addEventListener('toggle', toggle, true);
  document.addEventListener('scroll', position, true);
  win?.addEventListener('resize', position);
  const handle = {
    element,
    close,
    position,
    get opened() {
      return opened;
    },
    open() {
      if (disposed || !owner.isConnected) return;
      scope = owner.closest('.fivo-viewer') ?? document;
      const previous = activePopups.get(scope);
      if (previous && previous !== identity) previous.close();
      opened = true;
      activePopups.set(scope, identity);
      present();
    },
    dispose() {
      close();
      disposed = true;
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('toggle', toggle, true);
      document.removeEventListener('scroll', position, true);
      win?.removeEventListener('resize', position);
      element.remove();
    },
  };
  return handle;
}
