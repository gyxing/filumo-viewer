import { createShellIcon } from './icons';
import { measureToolbarMenu, positionToolbarMenu } from './menuPlacement';
import { closeOptionPopups } from './OptionPopup';
import type { ToolbarMenuItem } from './toolbarMenuItems';

interface MenuRow {
  item: ToolbarMenuItem;
  button: HTMLButtonElement;
  label: HTMLElement;
  value: HTMLElement;
  indicator: HTMLElement;
  icon?: SVGSVGElement;
}
interface MenuLevel {
  element: HTMLElement;
  rows: Map<string, MenuRow>;
  items: readonly ToolbarMenuItem[];
  active?: string;
  parent?: MenuRow;
  width?: number;
  sizeKey?: string;
}
let sequence = 0;
// 延迟展开与关闭为鼠标跨越两层菜单留出时间，避免经过相邻行时闪烁。
const OPEN_DELAY = 120;
const CLOSE_DELAY = 200;

/** 纯菜单管理级联选项和键盘焦点，不承载工具栏表单控件。 */
export function createToolbarMenu(
  trigger: HTMLButtonElement,
  owner: HTMLElement,
  onError: (error: unknown) => void,
) {
  const document = owner.ownerDocument;
  const win = document.defaultView;
  const levels: MenuLevel[] = [];
  let opened = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let typed = '';
  let typedAt = 0;
  const cancelHover = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const focusRow = (level: MenuLevel, id: string | undefined, focus = true) => {
    level.active = id;
    for (const [key, row] of level.rows) {
      row.button.tabIndex = key === id && !row.item.disabled ? 0 : -1;
      row.button.dataset.active = String(key === id);
    }
    const button = id ? level.rows.get(id)?.button : undefined;
    if (focus && button && !button.disabled) {
      button.focus({ preventScroll: true });
      // 只滚动所属菜单，避免 scrollIntoView 连带移动宿主页面。
      if (button.offsetTop < level.element.scrollTop)
        level.element.scrollTop = button.offsetTop;
      else if (button.offsetTop + button.offsetHeight > level.element.scrollTop + level.element.clientHeight)
        level.element.scrollTop = button.offsetTop + button.offsetHeight - level.element.clientHeight;
    }
  };
  const dismiss = (element: HTMLElement) => {
    if (typeof element.hidePopover === 'function' && element.matches(':popover-open')) element.hidePopover();
    element.hidden = true;
  };
  const trim = (from: number) => {
    cancelHover();
    for (const level of levels.splice(from)) {
      if (level.parent?.item.children?.length)
        level.parent.button.setAttribute('aria-expanded', 'false');
      level.parent?.button.removeAttribute('aria-controls');
      dismiss(level.element);
      level.element.remove();
    }
  };
  const close = (restoreFocus = false) => {
    cancelHover();
    opened = false;
    trim(1);
    dismiss(levels[0].element);
    trigger.setAttribute('aria-expanded', 'false');
    delete owner.dataset.open;
    typed = '';
    if (restoreFocus && trigger.isConnected && trigger.getClientRects().length)
      trigger.focus({ preventScroll: true });
  };
  const position = () => {
    if (!opened) return;
    if (!trigger.isConnected || !trigger.getClientRects().length) {
      close();
      return;
    }
    for (let index = 0; index < levels.length; index++) {
      const level = levels[index];
      const anchor = level.parent?.button ?? trigger;
      if (index && level.parent) {
        const parent = levels[index - 1].element.getBoundingClientRect();
        const box = anchor.getBoundingClientRect();
        if (box.bottom <= parent.top || box.top >= parent.bottom) {
          const hadFocus = level.element.contains(document.activeElement);
          trim(index);
          if (hadFocus) trigger.focus({ preventScroll: true });
          break;
        }
      }
      level.width ??= measureToolbarMenu(level.element, index > 0);
      positionToolbarMenu(level.element, anchor, index > 0, level.width);
    }
  };
  const present = (level: MenuLevel) => {
    level.element.hidden = false;
    if (typeof level.element.showPopover === 'function' && !level.element.matches(':popover-open'))
      level.element.showPopover();
  };
  const activate = (level: MenuLevel, row: MenuRow) => {
    if (!opened || disposed || !levels.includes(level) || row.item.disabled) return;
    if (row.item.children?.length) {
      expand(level, row, true);
      return;
    }
    trim(levels.indexOf(level) + 1);
    const action = row.item;
    if (action.closeOnRun ?? (action.kind !== 'checkbox')) close(true);
    void Promise.resolve()
      .then(() => { if (!disposed) return action.run?.(); })
      .catch((error) => { if (!disposed) onError(error); });
  };
  // 每一行持有稳定处理器，延迟任务读取最新行状态，不在循环内捕获共享计时器。
  const pointerMove = (level: MenuLevel, row: MenuRow) => (event: PointerEvent) => {
    if (event.pointerType === 'touch' || row.item.disabled) return;
    if (level.active === row.item.id && timer) return;
    cancelHover();
    focusRow(level, row.item.id, false);
    timer = setTimeout(() => {
      timer = undefined;
      if (!opened || disposed) return;
      if (row.item.children?.length) expand(level, row, false);
      else trim(levels.indexOf(level) + 1);
    }, row.item.children?.length ? OPEN_DELAY : CLOSE_DELAY);
  };
  const reconcile = (level: MenuLevel, items: readonly ToolbarMenuItem[]) => {
    // 状态勾选不会改变列宽，只有文字、当前值或图标变化时才重新测量。
    const sizeKey = JSON.stringify(items.map((item) => [item.label, item.value, item.icon]));
    if (sizeKey !== level.sizeKey) {
      level.sizeKey = sizeKey;
      level.width = undefined;
    }
    level.element.dataset.icons = String(items.some((item) => Boolean(item.icon)));
    const focused = document.activeElement;
    const hadFocus = level.element.contains(focused);
    const wanted = new Set(items.map((item) => item.id));
    for (const [id, row] of level.rows) if (!wanted.has(id)) {
      row.button.remove();
      level.rows.delete(id);
    }
    level.element.querySelectorAll(':scope > [role="separator"]').forEach((node) => node.remove());
    let cursor = level.element.firstChild;
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      let row = level.rows.get(item.id);
      if (!row) {
        const button = document.createElement('button');
        button.type = 'button';
        button.tabIndex = -1;
        button.className = 'filumo-toolbar-menu-item';
        const label = document.createElement('span');
        label.className = 'filumo-menu-label';
        const value = document.createElement('span');
        value.className = 'filumo-menu-value';
        const indicator = document.createElement('span');
        indicator.className = 'filumo-menu-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        button.append(label, value, indicator);
        row = { item, button, label, value, indicator };
        level.rows.set(item.id, row);
        const owned = row;
        button.onclick = () => activate(level, owned);
        button.onfocus = () => focusRow(level, owned.item.id, false);
        button.onpointermove = pointerMove(level, owned);
      }
      row.item = item;
      row.button.dataset.icon = item.icon ?? '';
      row.button.dataset.filumoMenuAction = item.id;
      row.button.setAttribute('role', item.kind ? 'menuitem' + item.kind : 'menuitem');
      row.button.setAttribute('aria-label', item.label);
      row.button.disabled = Boolean(item.disabled);
      row.label.textContent = item.label;
      row.label.title = item.label;
      row.value.textContent = item.value ?? '';
      row.value.title = item.value ?? '';
      row.value.hidden = !item.value;
      if (item.kind) row.button.setAttribute('aria-checked', String(Boolean(item.checked)));
      else row.button.removeAttribute('aria-checked');
      const hasChildren = Boolean(item.children?.length);
      if (hasChildren) {
        row.button.setAttribute('aria-haspopup', 'menu');
        if (!row.button.hasAttribute('aria-expanded')) row.button.setAttribute('aria-expanded', 'false');
      } else {
        row.button.removeAttribute('aria-haspopup');
        row.button.removeAttribute('aria-expanded');
        row.button.removeAttribute('aria-controls');
      }
      const indicator = hasChildren ? 'next' : item.checked ? 'check' : undefined;
      if (row.indicator.dataset.icon !== (indicator ?? '')) {
        row.indicator.replaceChildren(...(indicator ? [createShellIcon(document, indicator)] : []));
        row.indicator.dataset.icon = indicator ?? '';
      }
      if (row.icon?.dataset.name !== item.icon) {
        row.icon?.remove();
        row.icon = undefined;
        if (item.icon) {
          row.icon = createShellIcon(document, item.icon);
          row.icon.dataset.name = item.icon;
          row.button.prepend(row.icon);
        }
      }
      if (index && (item.dividerBefore || (item.kind === 'checkbox') !== (items[index - 1].kind === 'checkbox'))) {
        const separator = document.createElement('div');
        separator.setAttribute('role', 'separator');
        level.element.insertBefore(separator, cursor);
      }
      if (row.button === cursor) cursor = cursor.nextSibling;
      else level.element.insertBefore(row.button, cursor);
    }
    level.items = items;
    const active = items.find((item) => item.id === level.active && !item.disabled)
      ?? items.find((item) => !item.disabled);
    const restoreFocus = hadFocus && (document.activeElement !== focused ||
      Boolean((focused as HTMLButtonElement | null)?.disabled));
    focusRow(level, active?.id, restoreFocus);
    if (restoreFocus && !active && opened)
      level.element.focus({ preventScroll: true });
  };
  const makeLevel = (parent?: MenuRow): MenuLevel => {
    const element = document.createElement('div');
    element.className = 'filumo-toolbar-menu';
    element.id = 'filumo-toolbar-menu-' + ++sequence;
    element.setAttribute('role', 'menu');
    element.tabIndex = -1;
    element.hidden = true;
    if (typeof element.showPopover === 'function') element.setAttribute('popover', 'manual');
    const level: MenuLevel = { element, rows: new Map(), items: [], parent };
    element.onpointerenter = cancelHover;
    element.onpointerleave = (event) => {
      if (owner.contains(event.relatedTarget as Node | null)) return;
      cancelHover();
      timer = setTimeout(() => {
        const depth = levels.indexOf(level);
        if (depth >= 0) trim(1);
      }, CLOSE_DELAY);
    };
    element.onkeydown = (event) => {
      if (!opened || event.defaultPrevented) return;
      cancelHover();
      const entries = level.items.filter((item) => !item.disabled);
      const index = entries.findIndex((item) => item.id === level.active);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        trim(levels.indexOf(level) + 1);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length;
        focusRow(level, entries[next]?.id);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopPropagation();
        const row = level.active ? level.rows.get(level.active) : undefined;
        if (row?.item.children?.length) expand(level, row, true);
      } else if (event.key === 'ArrowLeft' || event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (level.parent) {
          const parent = level.parent;
          trim(levels.indexOf(level));
          parent.button.focus({ preventScroll: true });
        } else if (levels.length > 1) {
          const parent = levels[1].parent!;
          trim(1);
          parent.button.focus({ preventScroll: true });
        } else if (event.key === 'Escape') close(true);
      } else if (event.key === 'Tab') {
        // 先回到触发按钮，再让浏览器完成正常的 Tab 顺序，不困住焦点。
        close(true);
      } else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        const now = Date.now();
        typed = (now - typedAt < 700 ? typed : '') + event.key.toLocaleLowerCase();
        typedAt = now;
        const match = entries.find((item) => item.label.toLocaleLowerCase().startsWith(typed));
        if (match) focusRow(level, match.id);
      }
    };
    owner.append(element);
    return level;
  };
  function expand(level: MenuLevel, row: MenuRow, focus: boolean) {
    cancelHover();
    if (!opened || row.item.disabled || !row.item.children?.length) return;
    const depth = levels.indexOf(level) + 1;
    if (levels[depth]?.parent !== row) {
      trim(depth);
      typed = '';
      const child = makeLevel(row);
      levels.push(child);
      child.element.setAttribute('aria-label', row.item.label);
      reconcile(child, row.item.children);
      row.button.setAttribute('aria-expanded', 'true');
      row.button.setAttribute('aria-controls', child.element.id);
      present(child);
    }
    position();
    if (focus) focusRow(levels[depth], levels[depth].items.find((item) => !item.disabled)?.id);
  }
  const root = makeLevel();
  levels.push(root);
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-controls', root.element.id);
  trigger.setAttribute('aria-expanded', 'false');
  const open = (focus = false, last = false) => {
    if (disposed || !root.items.length || trigger.disabled || !trigger.isConnected) return;
    closeOptionPopups(owner);
    opened = true;
    owner.dataset.open = 'true';
    trigger.setAttribute('aria-expanded', 'true');
    present(root);
    position();
    if (focus) {
      const entries = root.items.filter((item) => !item.disabled);
      focusRow(root, (last ? entries.at(-1) : entries[0])?.id);
    }
  };
  const outside = (event: Event) => {
    if (!owner.closest('[data-filumo-moving]') && !owner.contains(event.target as Node)) close();
  };
  trigger.onclick = (event) => {
    if (opened) close();
    else open(event.detail === 0);
  };
  trigger.onkeydown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open(true, event.key === 'ArrowUp');
    } else if (event.key === 'Escape' && opened) {
      event.preventDefault();
      if (levels.length > 1) trim(1);
      else close(true);
    }
  };
  const viewport = win?.visualViewport;
  const resize = () => {
    for (const level of levels) level.width = undefined;
    position();
  };
  document.addEventListener('pointerdown', outside);
  document.addEventListener('focusin', outside);
  document.addEventListener('scroll', position, true);
  win?.addEventListener('resize', resize);
  viewport?.addEventListener('resize', resize);
  return {
    close,
    position,
    get opened() { return opened; },
    update(items: readonly ToolbarMenuItem[], label: string) {
      const focused = document.activeElement;
      root.element.setAttribute('aria-label', label);
      reconcile(root, items);
      for (let index = 1; index < levels.length; index++) {
        const level = levels[index];
        const parent = level.parent!;
        const current = levels[index - 1].rows.get(parent.item.id);
        if (current !== parent || current.item.disabled || !current.item.children?.length) {
          const restore = levels.slice(index).some((entry) => entry.element.contains(focused));
          trim(index);
          if (restore) focusRow(levels[index - 1], levels[index - 1].active);
          break;
        }
        level.element.setAttribute('aria-label', current.item.label);
        reconcile(level, current.item.children);
      }
      if (!items.length) close(owner.contains(focused));
      else position();
    },
    dispose() {
      close();
      disposed = true;
      root.element.remove();
      trigger.onclick = trigger.onkeydown = null;
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('scroll', position, true);
      win?.removeEventListener('resize', resize);
      viewport?.removeEventListener('resize', resize);
    },
  };
}
