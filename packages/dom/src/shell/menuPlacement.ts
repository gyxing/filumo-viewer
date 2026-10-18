const MENU_MAX_WIDTH = 224;
const MAIN_MIN_WIDTH = 160;
const SUBMENU_MIN_WIDTH = 112;

/** 按当前层级内容测量建议宽度，避免子菜单继承主菜单或上次窄容器的尺寸。 */
export function measureToolbarMenu(element: HTMLElement, nested: boolean) {
  element.style.width = 'max-content';
  element.style.minWidth = (nested ? SUBMENU_MIN_WIDTH : MAIN_MIN_WIDTH) + 'px';
  element.style.maxWidth = MENU_MAX_WIDTH + 'px';
  const width = Math.ceil(element.getBoundingClientRect().width);
  element.style.minWidth = '0';
  element.style.maxWidth = 'none';
  return width;
}

/** 主菜单与级联子菜单都限制在预览器和视口的交集内，空间不足时翻转方向。 */
export function positionToolbarMenu(
  element: HTMLElement, anchor: HTMLElement, nested: boolean, preferredWidth: number,
) {
  const win = anchor.ownerDocument.defaultView;
  if (!win) return;
  const root = anchor.closest('.fivo-viewer')?.getBoundingClientRect();
  const box = anchor.getBoundingClientRect();
  const left = Math.max(4, root?.left ?? 4);
  const right = Math.min(win.innerWidth - 4, root?.right ?? win.innerWidth - 4);
  const top = Math.max(4, root?.top ?? 4);
  const bottom = Math.min(win.innerHeight - 4, root?.bottom ?? win.innerHeight - 4);
  const width = Math.max(0, Math.min(preferredWidth, right - left));
  element.style.width = width + 'px';
  let x: number, y: number;
  if (nested) {
    const parent = anchor.parentElement!.getBoundingClientRect();
    // 两侧都放不下时选择空余更多的一侧，再向容器内平移，减少对子菜单入口的遮挡。
    const opensLeft = parent.right + 4 + width > right &&
      (parent.left - 4 - width >= left || parent.left - left > right - parent.right);
    x = opensLeft ? parent.left - 4 - width : parent.right + 4;
    element.dataset.side = opensLeft ? 'left' : 'right';
    element.style.maxHeight = Math.max(0, Math.min(360, bottom - top)) + 'px';
    y = box.top - 4;
  } else {
    const below = bottom - box.bottom - 6;
    const above = box.top - top - 6;
    const opensAbove = below < 160 && above > below;
    element.style.maxHeight = Math.max(0, Math.min(360, opensAbove ? above : below)) + 'px';
    x = box.right - width;
    y = opensAbove ? box.top - element.getBoundingClientRect().height - 6 : box.bottom + 6;
  }
  const height = element.getBoundingClientRect().height;
  element.style.left = Math.max(left, Math.min(x, right - width)) + 'px';
  element.style.top = Math.max(top, Math.min(y, bottom - height)) + 'px';
}
