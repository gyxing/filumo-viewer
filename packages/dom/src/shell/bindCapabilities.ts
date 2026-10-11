import type {
  CapabilityAction,
  ViewerCapabilities,
} from '../capabilities/types';
import { labelShellButton, type ShellIcon } from './icons';
import { createToolbarOverflow, type ToolbarItem } from './overflow';

interface ActionElement {
  kind: CapabilityAction['kind'];
  node: HTMLElement;
  control: HTMLButtonElement | HTMLSelectElement;
  label?: HTMLElement;
  current: CapabilityAction;
}
/** 按能力更新控件，复用节点以保留键盘焦点，不识别具体文档格式。 */
export function bindCapabilities(
  container: HTMLElement,
  onError: (error: unknown) => void,
) {
  const document = container.ownerDocument;
  const actions = new Map<string, ActionElement>();
  const overflow = createToolbarOverflow(container);
  let current: ViewerCapabilities = {};
  const invoke = (action: () => unknown) => {
    void Promise.resolve().then(action).catch(onError);
  };
  const button = () => {
    const node = document.createElement('button');
    node.type = 'button';
    return node;
  };
  const zoomGroup = document.createElement('span');
  zoomGroup.className = 'fivo-capability-group';
  const minus = button(),
    plus = button(),
    zoomInput = document.createElement('input'),
    zoomUnit = document.createElement('span'),
    zoomField = document.createElement('label');
  zoomInput.type = 'number';
  zoomInput.step = 'any';
  zoomInput.className = 'fivo-zoom-input';
  zoomUnit.textContent = '%';
  zoomField.className = 'fivo-zoom-field';
  zoomField.append(zoomInput, zoomUnit);
  zoomGroup.append(zoomField, minus, plus);
  const commitZoom = () => {
    const zoom = current.zoom;
    if (!zoom) return;
    const value = Number(zoomInput.value);
    if (
      !zoomInput.value.trim() ||
      !Number.isFinite(value) ||
      value < zoom.min ||
      value > zoom.max
    ) {
      zoomInput.value = String(zoom.value);
      return;
    }
    if (value !== zoom.value) invoke(() => zoom.set(value));
  };
  zoomInput.onchange = commitZoom;
  zoomInput.onkeydown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitZoom();
    }
    if (event.key === 'Escape' && current.zoom)
      zoomInput.value = String(current.zoom.value);
  };
  minus.onclick = () => {
    const zoom = current.zoom;
    if (zoom)
      invoke(() => zoom.set(Math.max(zoom.min, zoom.value - zoom.step)));
  };
  plus.onclick = () => {
    const zoom = current.zoom;
    if (zoom)
      invoke(() => zoom.set(Math.min(zoom.max, zoom.value + zoom.step)));
  };
  const navGroup = document.createElement('span');
  navGroup.className = 'fivo-capability-group';
  const previous = button(),
    next = button(),
    page = document.createElement('input'),
    total = document.createElement('span');
  page.type = 'number';
  page.min = '1';
  page.className = 'fivo-page-input';
  navGroup.append(previous, page, total, next);
  previous.onclick = () => {
    const nav = current.navigation;
    if (nav) invoke(() => nav.goTo(nav.index - 1));
  };
  next.onclick = () => {
    const nav = current.navigation;
    if (nav) invoke(() => nav.goTo(nav.index + 1));
  };
  page.onchange = () => {
    const nav = current.navigation;
    if (!nav) return;
    const index = Number(page.value) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= nav.count) {
      page.value = String(nav.index + 1);
      return;
    }
    invoke(() => nav.goTo(index));
  };
  return {
    update(
      capabilities: ViewerCapabilities,
      locale: 'zh-CN' | 'en-US' = 'zh-CN',
      available = true,
    ) {
      current = capabilities;
      const en = locale === 'en-US';
      const ordered: ToolbarItem[] = [];
      const wanted = new Set(
        (capabilities.actions ?? []).map((action) => action.id),
      );
      for (const [id, entry] of actions)
        if (!wanted.has(id)) {
          entry.node.remove();
          actions.delete(id);
        }
      for (const action of capabilities.actions ?? []) {
        let entry = actions.get(action.id);
        if (entry && entry.kind !== action.kind) {
          entry.node.remove();
          actions.delete(action.id);
          entry = undefined;
        }
        if (!entry) {
          const control =
            action.kind === 'select'
              ? document.createElement('select')
              : button();
          const label =
            action.kind === 'select'
              ? document.createElement('span')
              : undefined;
          const node = label ? document.createElement('label') : control;
          node.classList.add('fivo-capability-group');
          node.dataset.fivoAction = action.id;
          if (label) node.append(label, control);
          entry = { kind: action.kind, node, control, label, current: action };
          actions.set(action.id, entry);
          const owned = entry;
          if (action.kind === 'select')
            control.onchange = () =>
              invoke(() =>
                owned.current.run((owned.control as HTMLSelectElement).value),
              );
          else control.onclick = () => invoke(() => owned.current.run());
        }
        entry.current = action;
        entry.control.disabled = !available || action.enabled === false;
        if (entry.label) {
          entry.label.textContent = action.label;
          entry.control.setAttribute('aria-label', action.label);
          entry.control.title = action.label;
          const select = entry.control as HTMLSelectElement;
          const optionKey = JSON.stringify(action.options ?? []);
          if (select.dataset.options !== optionKey) {
            select.replaceChildren(
              ...(action.options ?? []).map((item) => {
                const option = document.createElement('option');
                option.value = item.value;
                option.textContent = item.label;
                return option;
              }),
            );
            select.dataset.options = optionKey;
          }
          select.value = action.value ?? '';
        } else {
          // 能力末段仅用于展示图标；未知动作仍显示原标签，不判断文件格式。
          const icons: Record<string, ShellIcon> = {
            search: 'search',
            outline: 'outline',
            review: 'review',
            notes: 'notes',
          };
          labelShellButton(
            entry.control,
            action.label,
            icons[action.id.split('.').at(-1) ?? ''],
          );
          if (action.kind === 'toggle')
            entry.control.setAttribute(
              'aria-pressed',
              String(Boolean(action.pressed)),
            );
          else entry.control.removeAttribute('aria-pressed');
        }
        const semantic = action.id.split('.').at(-1);
        ordered.push({
          node: entry.node,
          secondary: ['zoomMode', 'sheet', 'transitions'].includes(
            semantic ?? '',
          ),
          priority: action.kind === 'select' ? 40 : 60,
        });
      }
      if (capabilities.navigation && capabilities.navigation.count > 1) {
        const nav = capabilities.navigation;
        labelShellButton(
          previous,
          en ? 'Previous' : '上一页',
          'previous',
          true,
        );
        labelShellButton(next, en ? 'Next' : '下一页', 'next', true);
        page.setAttribute('aria-label', en ? 'Page' : '页码');
        page.max = String(nav.count);
        if (document.activeElement !== page) page.value = String(nav.index + 1);
        total.textContent = '/ ' + nav.count;
        previous.disabled = !available || nav.index <= 0;
        next.disabled = !available || nav.index + 1 >= nav.count;
        page.disabled = !available;
        ordered.push({ node: navGroup, priority: 80 });
      } else navGroup.remove();
      if (capabilities.zoom) {
        const zoom = capabilities.zoom;
        labelShellButton(minus, en ? 'Zoom out' : '缩小', 'zoomOut', true);
        labelShellButton(plus, en ? 'Zoom in' : '放大', 'zoomIn', true);
        zoomInput.setAttribute(
          'aria-label',
          en ? 'Zoom percentage' : '缩放比例',
        );
        zoomInput.min = String(zoom.min);
        zoomInput.max = String(zoom.max);
        zoomInput.disabled = !available;
        if (document.activeElement !== zoomInput)
          zoomInput.value = String(zoom.value);
        minus.disabled = !available || zoom.value <= zoom.min;
        plus.disabled = !available || zoom.value >= zoom.max;
        ordered.push({ node: zoomGroup, priority: 100 });
      } else zoomGroup.remove();
      overflow.update(ordered, en);
    },
    dispose() {
      current = {};
      actions.clear();
      overflow.dispose();
      container.replaceChildren();
    },
  };
}
