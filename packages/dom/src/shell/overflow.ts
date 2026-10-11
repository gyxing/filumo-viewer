import { labelShellButton } from './icons';

export interface ToolbarItem {
  node: HTMLElement;
  secondary?: boolean;
  priority?: number;
}

/** 按实际可用宽度收纳控件；同一节点在主栏与更多面板之间移动，操作不会失效。 */
export function createToolbarOverflow(container: HTMLElement) {
  const document = container.ownerDocument;
  const window = document.defaultView;
  const toolbar = container.closest<HTMLElement>('.fivo-toolbar')!;
  const main = document.createElement('div');
  main.className = 'fivo-controls-main';
  const more = document.createElement('details');
  more.className = 'fivo-toolbar-more';
  const trigger = document.createElement('summary');
  const panel = document.createElement('div');
  panel.className = 'fivo-toolbar-menu';
  panel.setAttribute('role', 'group');
  more.append(trigger, panel);
  container.append(main, more);
  let items: ToolbarItem[] = [];
  let frame = 0;
  let disposed = false;
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
      order(
        main,
        items.filter((item) => !overflow.has(item)).map((item) => item.node),
      );
      order(
        panel,
        items.filter((item) => overflow.has(item)).map((item) => item.node),
      );
      more.hidden = !overflow.size;
      if (more.hidden) more.open = false;
    };
    const focused = document.activeElement as HTMLElement | null;
    apply();
    // 缩放比与当前页优先保留，次要能力退入更多面板而非堆叠成多行。
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
      container.contains(focused) &&
      document.activeElement !== focused
    ) {
      if (panel.contains(focused)) more.open = true;
      focused.focus({ preventScroll: true });
    }
  };
  const schedule = () => {
    if (!disposed && !frame) frame = window?.requestAnimationFrame(layout) ?? 0;
  };
  const Resize = window?.ResizeObserver;
  const resize = Resize ? new Resize(schedule) : undefined;
  resize?.observe(toolbar);
  const outside = (event: Event) => {
    if (!more.contains(event.target as Node)) more.open = false;
  };
  const escape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && more.open) {
      event.preventDefault();
      more.open = false;
      trigger.focus();
    }
  };
  document.addEventListener('pointerdown', outside);
  container.addEventListener('keydown', escape);
  return {
    update(next: ToolbarItem[], en: boolean) {
      const wanted = new Set(next.map((item) => item.node));
      for (const item of items) if (!wanted.has(item.node)) item.node.remove();
      items = next;
      labelShellButton(trigger, en ? 'More actions' : '更多操作', 'more', true);
      panel.setAttribute('aria-label', en ? 'More actions' : '更多操作');
      layout();
      schedule();
    },
    dispose() {
      disposed = true;
      resize?.disconnect();
      if (frame) window?.cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', outside);
      container.removeEventListener('keydown', escape);
      main.remove();
      more.remove();
    },
  };
}
