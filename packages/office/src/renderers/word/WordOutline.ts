import type { WordOutlineProvider } from '../../engine/word/WordOutlineProvider';
import type { WordOutlineTreeNode } from '../../engine/word/types';
import type { OfficeRenderContext } from '../../view/types';
import { setOfficeIconButton } from '../../view/ui';
import { mountSidebarResize } from '../common/SidebarResize';
import './styles/outline.less';
import { flattenOutlineRows, type OutlineRow } from './support/outlineTree';

// 虚拟窗口、键盘定位和 CSS 使用相同尺寸，防止滚动后连接线错位。
const ROW_HEIGHT = 28;
// 收紧窄侧栏的层级留白，连接线长度在 outline.less 中同步调整。
const INDENT = 16;
const COMPLETE_TREE_LIMIT = 200;

/** 原生大纲共享按层 Provider，保留经典树形效果、键盘导航与正文定位。 */
export class WordOutline {
  readonly element: HTMLElement;
  private list: HTMLDivElement;
  private canvas: HTMLDivElement;
  private title: HTMLButtonElement;
  private count: HTMLSpanElement;
  private find: HTMLButtonElement;
  private close: HTMLButtonElement;
  private expanded = new Set<string>();
  private initialized = new Set<string>();
  private children = new Map<string, WordOutlineTreeNode[]>();
  private loading = new Map<string, Promise<void>>();
  private nodes = new Map<string, WordOutlineTreeNode>();
  private roots: WordOutlineTreeNode[] = [];
  private rows: OutlineRow[] = [];
  private active = '';
  private focused = '';
  private closed = false;
  private version = 0;
  private revision = -1;
  private revealing = 0;
  private navigating = 0;
  private resize: ReturnType<typeof mountSidebarResize>;
  private observer?: MutationObserver;
  private sizeObserver?: ResizeObserver;
  private cancel?: () => void;
  private stop: () => void;
  private key = 'outline-' + Math.random().toString(36).slice(2);

  constructor(
    private readonly provider: WordOutlineProvider,
    private readonly base: OfficeRenderContext,
    private readonly navigate: (id: string) => Promise<boolean>,
    private readonly scroller?: HTMLElement,
  ) {
    const doc = base.document;
    this.element = doc.createElement('aside');
    this.element.className = 'fivo-native-word-outline';
    const header = doc.createElement('header');
    const tabs = doc.createElement('div');
    tabs.className = 'fivo-native-navigation-tabs';
    this.title = doc.createElement('button');
    this.title.type = 'button';
    this.title.className = 'fivo-native-tab fivo-native-tab--active';
    this.title.setAttribute('aria-pressed', 'true');
    this.find = doc.createElement('button');
    this.find.type = 'button';
    this.find.className = 'fivo-native-tab';
    this.find.onclick = () => {
      void base.services.state
        .execute({ type: 'search', open: true })
        .catch(base.onError);
    };
    tabs.append(this.title, this.find);
    this.count = doc.createElement('span');
    this.count.className = 'fivo-native-count';
    this.close = doc.createElement('button');
    this.close.type = 'button';
    this.close.onclick = () => {
      void base.services.state
        .execute({ type: 'outline', open: false })
        .catch(base.onError);
    };
    header.append(tabs, this.count, this.close);
    this.list = doc.createElement('div');
    this.list.className = 'fivo-native-list';
    this.list.setAttribute('role', 'tree');
    this.canvas = doc.createElement('div');
    this.canvas.className = 'fivo-native-list-canvas';
    this.list.append(this.canvas);
    this.element.append(header, this.list);
    this.list.onscroll = () => this.render();
    this.stop = provider.subscribe(() => this.refresh());
    this.resize = mountSidebarResize(
      this.element,
      'right',
      base.services.layout,
      '调整大纲宽度',
      () => this.render(),
    );
    const win = doc.defaultView;
    if (win?.ResizeObserver) {
      this.sizeObserver = new win.ResizeObserver(() => this.render());
      this.sizeObserver.observe(this.list);
    }
    if (scroller) {
      scroller.addEventListener('scroll', this.scheduleSync, { passive: true });
      if (win?.MutationObserver) {
        this.observer = new win.MutationObserver(this.scheduleSync);
        this.observer.observe(scroller, { childList: true, subtree: true });
      }
    }
    this.refresh();
  }

  private refresh() {
    if (this.closed) return;
    const snapshot = this.provider.getSnapshot();
    if (snapshot.revision !== this.revision) {
      this.revision = snapshot.revision;
      this.version++;
      this.children.clear();
      this.loading.clear();
    }
    const complete = snapshot.complete && snapshot.count <= COMPLETE_TREE_LIMIT;
    this.roots = this.provider.getRoots(complete ? undefined : 2);
    this.nodes.clear();
    const visit = (nodes: WordOutlineTreeNode[], depth: number) =>
      nodes.forEach((node) => {
        this.nodes.set(node.id, node);
        // 小树默认全部展开，大树只展开首层；用户手动收起后不被刷新覆盖。
        if (!this.initialized.has(node.id)) {
          this.initialized.add(node.id);
          if (!node.isLeaf && (complete || depth === 0))
            this.expanded.add(node.id);
        }
        if (node.children) this.children.set(node.id, node.children);
        if (this.expanded.has(node.id)) {
          if (node.children) visit(node.children, depth + 1);
          else if (!node.isLeaf)
            void this.loadChildren(node.id).catch((error) => {
              if (!this.closed) this.base.onError(error);
            });
        }
      });
    visit(this.roots, 0);
    this.rebuild();
    this.scheduleSync();
  }

  private rebuild() {
    this.rows = flattenOutlineRows(this.roots, this.expanded, this.children);
    this.render();
  }

  private loadChildren(id: string): Promise<void> {
    if (this.children.has(id)) return Promise.resolve();
    const pending = this.loading.get(id);
    if (pending) return pending;
    const version = this.version;
    const task = this.provider
      .getChildren(id)
      .then((children) => {
        if (this.closed || version !== this.version) return;
        this.children.set(id, children);
        children.forEach((child) => this.nodes.set(child.id, child));
        this.rebuild();
      })
      .finally(() => {
        if (this.closed || version !== this.version) return;
        this.loading.delete(id);
        this.render();
      });
    this.loading.set(id, task);
    return task;
  }

  private toggle(id: string) {
    this.revealing++;
    if (this.expanded.has(id)) {
      this.expanded.delete(id);
      this.rebuild();
    } else {
      this.expanded.add(id);
      this.rebuild();
      const version = this.version;
      void this.loadChildren(id).catch((error) => {
        if (this.closed || version !== this.version) return;
        this.expanded.delete(id);
        this.rebuild();
        this.base.onError(error);
      });
    }
  }

  private select(node: WordOutlineTreeNode) {
    this.revealing++;
    this.active = this.focused = node.id;
    this.navigating++;
    this.render();
    // 点击只定位正文，不把已在视野内的目录项再次强制居中。
    void this.navigate(node.targetBlockId)
      .catch(this.base.onError)
      .finally(() => {
        this.navigating--;
      });
  }

  private focusRow(index: number) {
    const row = this.rows[Math.max(0, Math.min(this.rows.length - 1, index))];
    if (!row) return;
    this.focused = row.node.id;
    const top = this.rows.indexOf(row) * ROW_HEIGHT;
    if (top < this.list.scrollTop) this.list.scrollTop = top;
    else if (top + ROW_HEIGHT > this.list.scrollTop + this.list.clientHeight)
      this.list.scrollTop = top + ROW_HEIGHT - this.list.clientHeight;
    this.render();
    this.canvas
      .querySelector<HTMLElement>(
        '[data-outline-id="' + CSS.escape(this.focused) + '"]',
      )
      ?.focus({ preventScroll: true });
  }

  private keyDown(event: KeyboardEvent, index: number) {
    const row = this.rows[index];
    if (!row) return;
    switch (event.key) {
      case 'ArrowDown':
        this.focusRow(index + 1);
        break;
      case 'ArrowUp':
        this.focusRow(index - 1);
        break;
      case 'Home':
        this.focusRow(0);
        break;
      case 'End':
        this.focusRow(this.rows.length - 1);
        break;
      case 'ArrowRight':
        if (!row.node.isLeaf && !this.expanded.has(row.node.id))
          this.toggle(row.node.id);
        else if (this.rows[index + 1]?.parentId === row.node.id)
          this.focusRow(index + 1);
        break;
      case 'ArrowLeft':
        if (this.expanded.has(row.node.id) && !row.node.isLeaf)
          this.toggle(row.node.id);
        else if (row.parentId)
          this.focusRow(
            this.rows.findIndex((item) => item.node.id === row.parentId),
          );
        break;
      case 'Enter':
      case ' ':
        this.select(row.node);
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  private render() {
    if (this.closed) return;
    const en = this.base.locale === 'en-US';
    this.element.setAttribute(
      'aria-label',
      en ? 'Document outline' : '文档大纲',
    );
    this.list.setAttribute('aria-label', en ? 'Headings' : '大纲条目');
    this.title.textContent = en ? 'Outline' : '大纲';
    this.find.textContent = en ? 'Find' : '查找';
    this.count.textContent = String(this.provider.getSnapshot().count);
    this.count.title = en ? 'Headings' : '大纲条目数';
    setOfficeIconButton(
      this.close,
      en ? 'Collapse outline' : '收起大纲',
      'panelLeftClose',
    );
    this.resize?.setLabel(en ? 'Resize outline' : '调整大纲宽度');
    this.list.setAttribute('aria-busy', String(this.loading.size > 0));
    const focusInside = this.list.contains(this.base.document.activeElement);
    const start = Math.max(0, Math.floor(this.list.scrollTop / ROW_HEIGHT) - 8);
    const end = Math.min(
      this.rows.length,
      Math.ceil(
        (this.list.scrollTop + (this.list.clientHeight || 500)) / ROW_HEIGHT,
      ) + 8,
    );
    this.canvas.style.height = this.rows.length * ROW_HEIGHT + 'px';
    this.canvas.replaceChildren();
    for (let index = start; index < end; index++) {
      const item = this.rows[index];
      const { node, depth } = item;
      const row = this.base.document.createElement('div');
      row.className = 'fivo-native-outline-row';
      row.dataset.outlineId = node.id;
      row.style.top = index * ROW_HEIGHT + 'px';
      row.style.paddingLeft = depth * INDENT + 'px';
      row.setAttribute('role', 'treeitem');
      row.setAttribute('aria-level', String(depth + 1));
      row.setAttribute('aria-posinset', String(item.siblingIndex + 1));
      row.setAttribute('aria-setsize', String(item.siblingCount));
      row.setAttribute('aria-selected', String(node.id === this.active));
      row.tabIndex =
        node.id === (this.focused || this.active || this.rows[0]?.node.id)
          ? 0
          : -1;
      row.onfocus = () => {
        this.focused = node.id;
      };
      row.onkeydown = (event) => this.keyDown(event, index);
      row.onclick = () => {
        this.select(node);
        this.focusRow(index);
      };
      if (depth) {
        const guides = this.base.document.createElement('span');
        guides.className = 'fivo-outline-guides';
        guides.setAttribute('aria-hidden', 'true');
        item.ancestorHasNextSibling.slice(1).forEach((continues, level) => {
          if (!continues) return;
          const guide = this.base.document.createElement('span');
          guide.className = 'fivo-outline-guide';
          guide.style.left = level * INDENT + 10 + 'px';
          guides.append(guide);
        });
        const branch = this.base.document.createElement('span');
        branch.className = 'fivo-outline-branch';
        branch.dataset.continues = String(item.hasNextSibling);
        branch.dataset.leaf = String(node.isLeaf);
        branch.style.left = (depth - 1) * INDENT + 10 + 'px';
        guides.append(branch);
        row.append(guides);
      }
      const switcher = this.base.document.createElement(
        node.isLeaf ? 'span' : 'button',
      );
      switcher.className = node.isLeaf
        ? 'fivo-outline-leaf-space'
        : 'fivo-outline-switcher';
      if (!node.isLeaf) {
        const expanded = this.expanded.has(node.id);
        row.setAttribute('aria-expanded', String(expanded));
        (switcher as HTMLButtonElement).type = 'button';
        switcher.tabIndex = -1;
        switcher.dataset.expanded = String(expanded);
        switcher.dataset.hasChildren = String(
          this.rows[index + 1]?.parentId === node.id,
        );
        switcher.dataset.loading = String(this.loading.has(node.id));
        switcher.setAttribute(
          'aria-label',
          (expanded ? (en ? 'Collapse ' : '收起 ') : en ? 'Expand ' : '展开 ') +
            node.text,
        );
        const icon = this.base.document.createElement('span');
        icon.setAttribute('aria-hidden', 'true');
        switcher.append(icon);
        switcher.onclick = (event) => {
          event.stopPropagation();
          this.focused = node.id;
          this.toggle(node.id);
          this.focusRow(index);
        };
      } else switcher.setAttribute('aria-hidden', 'true');
      const label = this.base.document.createElement('span');
      label.className = 'fivo-native-outline-label';
      label.textContent = node.text;
      label.title = node.text;
      row.append(switcher, label);
      this.canvas.append(row);
      if (focusInside && node.id === this.focused)
        row.focus({ preventScroll: true });
    }
  }

  private scheduleSync = () => {
    if (this.closed || this.element.hidden || !this.scroller || this.navigating)
      return;
    this.cancel = this.base.services.layout.schedule(
      this.key,
      () => {
        const scroller = this.scroller!;
        const top = scroller.getBoundingClientRect().top + 48;
        let selected = '';
        let last = -Infinity;
        let firstBelow = Infinity;
        const ids = new Map(
          [...this.nodes.values()].map((node) => [node.targetBlockId, node.id]),
        );
        scroller
          .querySelectorAll<HTMLElement>(
            '[data-office-word-block-id],[data-office-doc-pagination-id]',
          )
          .forEach((element) => {
            const blockId =
              element.dataset.officeWordBlockId ??
              element.dataset.officeDocPaginationId;
            if (!blockId) return;
            const id =
              ids.get(blockId) ??
              this.provider.locate('outline-' + blockId)?.id;
            if (!id) return;
            const y = element.getBoundingClientRect().top;
            if (y <= top && y >= last) {
              last = y;
              selected = id;
            } else if (last === -Infinity && y > top && y < firstBelow) {
              firstBelow = y;
              selected = id;
            }
          });
        return selected;
      },
      (id) => {
        if (id && id !== this.active && !this.navigating)
          void this.reveal(id).catch(this.base.onError);
      },
    );
  };

  private async reveal(id: string) {
    const token = ++this.revealing;
    const version = this.version;
    const ancestors = await this.provider.getAncestors(id);
    if (
      this.closed ||
      version !== this.version ||
      token !== this.revealing ||
      this.navigating
    )
      return;
    for (const parent of ancestors) {
      this.expanded.add(parent);
      await this.loadChildren(parent);
      if (
        this.closed ||
        version !== this.version ||
        token !== this.revealing ||
        this.navigating
      )
        return;
    }
    this.active = id;
    this.rebuild();
    const index = this.rows.findIndex((row) => row.node.id === id);
    const height = this.list.clientHeight;
    if (index >= 0 && height > 0) {
      const middle = (index + 0.5) * ROW_HEIGHT - this.list.scrollTop;
      if (middle < height * 0.25 || middle > height * 0.6)
        this.list.scrollTop = Math.max(
          0,
          (index + 0.5) * ROW_HEIGHT - height * 0.4,
        );
      this.render();
    }
  }

  update(visible: boolean) {
    const changed = this.element.hidden === visible;
    this.element.hidden = !visible;
    if (visible && changed) this.refresh();
    else if (visible) this.render();
  }
  dispose() {
    this.closed = true;
    this.version++;
    this.revealing++;
    this.cancel?.();
    this.stop();
    this.sizeObserver?.disconnect();
    this.observer?.disconnect();
    this.scroller?.removeEventListener('scroll', this.scheduleSync);
    this.resize.dispose();
    this.element.remove();
  }
}
