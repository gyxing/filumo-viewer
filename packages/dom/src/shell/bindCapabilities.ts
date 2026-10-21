import type {
  CapabilityAction,
  ViewerCapabilities,
} from '../capabilities/types';
import { createSelectControl } from './SelectControl';
import { createZoomControl } from './ZoomControl';
import { getActionPresentation } from './actionPresentation';
import { createShellIcon, labelShellButton, type ShellIcon } from './icons';
import { createToolbarOverflow, type ToolbarItem } from './overflow';
import {
  actionMenuItem,
  navigationMenuItem,
  zoomMenuItem,
} from './toolbarMenuItems';

interface ActionElement {
  kind: CapabilityAction['kind'];
  node: HTMLElement;
  control: HTMLButtonElement;
  selection?: ReturnType<typeof createSelectControl>;
  label?: HTMLElement;
  icon?: ShellIcon;
  current: CapabilityAction;
}
/** 按能力更新控件，复用节点以保留键盘焦点，不识别具体文档格式。 */
export function bindCapabilities(
  container: HTMLElement,
  onError: (error: unknown) => void,
) {
  const document = container.ownerDocument;
  const actions = new Map<string, ActionElement>();
  const overflow = createToolbarOverflow(container, onError);
  let current: ViewerCapabilities = {};
  const invoke = (action: () => unknown) => {
    void Promise.resolve().then(action).catch(onError);
  };
  const button = () => {
    const node = document.createElement('button');
    node.type = 'button';
    return node;
  };
  const zoomControl = createZoomControl(document, onError);
  const navGroup = document.createElement('span');
  navGroup.className = 'filumo-capability-group filumo-navigation-control';
  const previous = button(),
    next = button(),
    page = document.createElement('input'),
    total = document.createElement('span');
  page.type = 'number';
  page.min = '1';
  page.className = 'filumo-page-input';
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
          entry.selection?.dispose();
          entry.node.remove();
          actions.delete(id);
        }
      for (const action of capabilities.actions ?? []) {
        if (action.toolbar?.visible === false) {
          actions.get(action.id)?.selection?.close();
          actions.get(action.id)?.node.remove();
          continue;
        }
        let entry = actions.get(action.id);
        if (entry && entry.kind !== action.kind) {
          entry.selection?.dispose();
          entry.node.remove();
          actions.delete(action.id);
          entry = undefined;
        }
        if (!entry) {
          const selection =
            action.kind === 'select'
              ? createSelectControl(document, onError)
              : undefined;
          const control = selection?.control ?? button();
          const label =
            action.kind === 'select'
              ? document.createElement('span')
              : undefined;
          const node = label ? document.createElement('label') : control;
          node.classList.add('filumo-capability-group');
          node.dataset.filumoAction = action.id;
          if (label) {
            label.className = 'filumo-capability-label';
            node.append(label, selection!.element);
          }
          entry = {
            kind: action.kind,
            node,
            control,
            label,
            selection,
            current: action,
          };
          actions.set(action.id, entry);
          const owned = entry;
          if (!selection)
            control.onclick = () => {
              // 查找等动作先收起菜单，随后由实际动作把焦点交给内容区。
              if (owned.current.kind === 'action') overflow.close();
              invoke(() => owned.current.run());
            };
        }
        entry.current = action;
        entry.control.disabled = !available || action.enabled === false;
        const presentation = getActionPresentation(action);
        if (entry.label) {
          entry.label.textContent = action.label;
          entry.label.hidden = !presentation.showLabel;
          entry.label.classList.toggle(
            'filumo-capability-label--visible',
            presentation.showLabel,
          );
          if (entry.icon !== presentation.icon) {
            entry.control.querySelector('.filumo-select-icon')?.remove();
            if (presentation.icon) {
              const icon = createShellIcon(document, presentation.icon);
              icon.classList.add('filumo-select-icon');
              entry.control.prepend(icon);
            }
            entry.icon = presentation.icon;
          }
          entry.selection?.update(action, available);
        } else {
          labelShellButton(
            entry.control,
            action.label,
            presentation.icon,
            !presentation.showLabel,
          );
          if (action.kind === 'toggle') {
            entry.control.setAttribute(
              'aria-pressed',
              String(Boolean(action.pressed)),
            );
          } else entry.control.removeAttribute('aria-pressed');
        }
        const semantic = action.id.split('.').at(-1);
        ordered.push({
          node: entry.node,
          menu: actionMenuItem(action, available),
          closeControl: entry.selection?.close,
          secondary: action.toolbar?.placement
            ? action.toolbar.placement === 'more'
            : ['zoomMode', 'sheet', 'transitions'].includes(semantic ?? ''),
          order: action.toolbar?.order ?? 0,
          priority:
            action.toolbar?.priority ?? (action.kind === 'select' ? 40 : 60),
        });
      }
      if (
        capabilities.navigation &&
        capabilities.navigation.count > 1 &&
        capabilities.navigation.toolbar?.visible !== false
      ) {
        const nav = capabilities.navigation;
        labelShellButton(
          previous,
          nav.toolbar?.previousLabel ?? (en ? 'Previous' : '上一页'),
          'previous',
          true,
        );
        labelShellButton(
          next,
          nav.toolbar?.nextLabel ?? (en ? 'Next' : '下一页'),
          'next',
          true,
        );
        page.hidden = total.hidden = nav.toolbar?.layout === 'buttons';
        page.setAttribute('aria-label', en ? 'Page' : '页码');
        page.max = String(nav.count);
        if (document.activeElement !== page) page.value = String(nav.index + 1);
        total.textContent = '/ ' + nav.count;
        previous.disabled = !available || nav.index <= 0;
        next.disabled = !available || nav.index + 1 >= nav.count;
        page.disabled = !available;
        ordered.push({
          node: navGroup,
          menu: navigationMenuItem(nav, en, available),
          order: nav.toolbar?.order ?? 1,
          priority: nav.toolbar?.priority ?? 80,
          secondary: nav.toolbar?.placement === 'more',
        });
      } else navGroup.remove();
      if (capabilities.zoom && capabilities.zoom.toolbar?.visible !== false) {
        const zoom = capabilities.zoom;
        zoomControl.update(zoom, locale, available);
        ordered.push({
          node: zoomControl.element,
          menu: zoomMenuItem(zoom, en, available),
          closeControl: zoomControl.close,
          order: zoom.toolbar?.order ?? 2,
          priority: zoom.toolbar?.priority ?? 100,
          secondary: zoom.toolbar?.placement === 'more',
        });
      } else {
        zoomControl.close();
        zoomControl.element.remove();
      }
      ordered.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      overflow.update(ordered, en);
    },
    dispose() {
      current = {};
      for (const entry of actions.values()) entry.selection?.dispose();
      actions.clear();
      zoomControl.dispose();
      overflow.dispose();
      container.replaceChildren();
    },
  };
}
