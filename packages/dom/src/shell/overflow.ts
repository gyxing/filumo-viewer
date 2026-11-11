import { labelShellButton } from './icons';
import { createToolbarMenu } from './ToolbarMenu';
import type { ToolbarMenuItem } from './toolbarMenuItems';

export interface ToolbarItem {
  node: HTMLElement;
  secondary?: boolean;
  priority?: number;
  order?: number;
  menu: ToolbarMenuItem;
  closeControl?(): void;
}

/** 主栏保留原控件，收纳时根据能力生成纯菜单，菜单内不挂载输入或选择控件。 */
export function createToolbarOverflow(
  container: HTMLElement,
  onError: (error: unknown) => void,
) {
  const document = container.ownerDocument;
  const window = document.defaultView;
  const toolbar = container.closest<HTMLElement>('.filumo-toolbar')!;
  const main = document.createElement('div');
  main.className = 'filumo-controls-main';
  const more = document.createElement('span');
  more.className = 'filumo-toolbar-more';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'filumo-toolbar-more-trigger';
  more.append(trigger);
  container.append(main);
  // 格式和外壳操作共用主栏；更多入口最后挂载，保持视觉与键盘顺序一致。
  toolbar.append(more);
  const menu = createToolbarMenu(trigger, more, onError);
  let items: ToolbarItem[] = [];
  let frame = 0;
  let disposed = false;
  let en = false;
  const order = (host: HTMLElement, nodes: HTMLElement[]) => {
    let cursor = host.firstChild;
    for (const node of nodes) {
      if (node === cursor) cursor = cursor.nextSibling;
      else host.insertBefore(node, cursor);
    }
  };
  const layout = () => {
    frame = 0;
    if (disposed || !toolbar.clientWidth) return;
    toolbar.dataset.compact = String(toolbar.clientWidth < 900);
    const overflow = new Set(items.filter((item) => item.secondary));
    const apply = () => {
      const primary = items.filter((item) => !overflow.has(item));
      order(
        main,
        primary.map((item) => item.node),
      );
      for (const item of overflow) {
        item.closeControl?.();
        item.node.remove();
      }
      // 展开时不临时隐藏触发容器，防止一次尺寸测量打断菜单内焦点。
      more.hidden = !overflow.size && !menu.opened;
      // 主栏没有格式控件时不占据额外的 flex 间距，窄窗口仍给末尾入口留足位置。
      container.hidden = !primary.length;
    };
    const focused = document.activeElement as HTMLElement | null;
    const hadMenuFocus = more.contains(focused);
    // 主栏与菜单之间的布局移动不代表用户离开控件，避免触发失焦提交。
    toolbar.dataset.filumoMoving = 'true';
    try {
      apply();
      // 最高优先级也参与最终收纳，极窄容器仍保持单行并保留更多入口。
      const candidates = items
        .filter((item) => !item.secondary)
        .sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
      for (const item of candidates) {
        if (toolbar.scrollWidth <= toolbar.clientWidth + 1) break;
        overflow.add(item);
        apply();
      }
      if (
        focused &&
        (container.contains(focused) || more.contains(focused)) &&
        document.activeElement !== focused
      ) {
        focused.focus({ preventScroll: true });
      }
      // 能力刷新只更新菜单数据，已展开的子菜单与聚焦项按稳定标识保留。
      menu.update(
        items.filter((item) => overflow.has(item)).map((item) => item.menu),
        en ? 'More actions' : '更多操作',
      );
      more.hidden = !overflow.size;
      if (
        focused &&
        !focused.isConnected &&
        items.some((item) => item.node.contains(focused))
      )
        trigger.focus({ preventScroll: true });
      if (more.hidden) {
        menu.close();
        if (hadMenuFocus) {
          const target =
            main.querySelector<HTMLElement>(
              'button:not(:disabled), input:not(:disabled)',
            ) ?? toolbar.querySelector<HTMLElement>('.filumo-open-file');
          target?.focus({ preventScroll: true });
        }
      }
    } finally {
      delete toolbar.dataset.filumoMoving;
    }
  };
  const schedule = () => {
    if (!disposed && !frame) frame = window?.requestAnimationFrame(layout) ?? 0;
  };
  const Resize = window?.ResizeObserver;
  const resize = Resize ? new Resize(schedule) : undefined;
  resize?.observe(toolbar);
  const close = () => {
    menu.close(more.contains(document.activeElement));
  };
  const restoreFocus = () => {
    const target = !more.hidden
      ? trigger
      : main.querySelector<HTMLElement>(
          'button:not(:disabled), input:not(:disabled)',
        );
    target?.focus({ preventScroll: true });
  };
  return {
    close,
    requestLayout: schedule,
    restoreFocus,
    update(next: ToolbarItem[], english: boolean) {
      const wanted = new Set(next.map((item) => item.node));
      for (const item of items) if (!wanted.has(item.node)) item.node.remove();
      items = next;
      en = english;
      labelShellButton(trigger, en ? 'More actions' : '更多操作', 'more', true);
      if (frame) window?.cancelAnimationFrame(frame);
      layout();
      schedule();
    },
    dispose() {
      disposed = true;
      resize?.disconnect();
      if (frame) window?.cancelAnimationFrame(frame);
      menu.dispose();
      main.remove();
      more.remove();
    },
  };
}
