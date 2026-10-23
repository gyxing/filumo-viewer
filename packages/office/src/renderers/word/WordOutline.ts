import { OUTLINE_DEFAULTS, OutlineTree } from '@filumo/dom/outline';
import type { WordOutlineProvider } from '../../engine/word/WordOutlineProvider';
import type { WordOutlineTreeNode } from '../../engine/word/types';
import type { OfficeRenderContext } from '../../view/types';
import { setOfficeIconButton } from '../../view/ui';
import { mountSidebarResize } from '../common/SidebarResize';
import './styles/outline.less';

/** 原生大纲共享按层 Provider，保留经典树形效果、键盘导航与正文定位。 */
export class WordOutline {
  readonly element: HTMLElement;
  private tree: OutlineTree<WordOutlineTreeNode>;
  private treeRevision = 0;
  private viewActive = true;
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
  private active = '';
  private closed = false;
  private version = 0;
  private revision = -1;
  private revealing = 0;
  private navigating = 0;
  private resize: ReturnType<typeof mountSidebarResize>;
  private observer?: MutationObserver;
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
    this.viewActive = base.isActive?.() ?? true;
    this.element = doc.createElement('aside');
    this.element.className = 'filumo-native-word-outline';
    const header = doc.createElement('header');
    const tabs = doc.createElement('div');
    tabs.className = 'filumo-native-navigation-tabs';
    this.title = doc.createElement('button');
    this.title.type = 'button';
    this.title.className = 'filumo-native-tab filumo-native-tab--active';
    this.title.setAttribute('aria-pressed', 'true');
    this.find = doc.createElement('button');
    this.find.type = 'button';
    this.find.className = 'filumo-native-tab';
    this.find.onclick = () => {
      void base.services.state
        .execute({ type: 'search', open: true })
        .catch(base.onError);
    };
    tabs.append(this.title, this.find);
    this.count = doc.createElement('span');
    this.count.className = 'filumo-native-count';
    this.close = doc.createElement('button');
    this.close.type = 'button';
    this.close.onclick = () => {
      void base.services.state
        .execute({ type: 'outline', open: false })
        .catch(base.onError);
    };
    header.append(tabs, this.count, this.close);
    this.tree = new OutlineTree({
      document: doc,
      locale: base.locale,
      stylePolicy: base.stylePolicy,
      accessors: {
        getId: (node: WordOutlineTreeNode) => node.id,
        getText: (node) => node.text,
        // 未提供叶节点标记时仍允许读取子节点，保持延迟加载的大纲可展开。
        isLeaf: (node) => node.isLeaf === true,
        getChildren: (node) => this.children.get(node.id) ?? node.children,
      },
      onToggle: (id, expanded) => {
        if (this.expanded.has(id) !== expanded) this.toggle(id);
      },
      onActivate: (id) => {
        const node = this.nodes.get(id);
        if (node) this.select(node);
      },
    });
    this.element.append(header, this.tree.element);
    this.stop = provider.subscribe(() => this.refresh());
    this.resize = mountSidebarResize(
      this.element,
      'right',
      base.services.layout,
      '调整大纲宽度',
      () => this.render(),
    );
    const win = doc.defaultView;
    if (scroller) {
      scroller.addEventListener('scroll', this.scheduleSync, { passive: true });
      if (win?.MutationObserver) {
        this.observer = new win.MutationObserver(this.scheduleSync);
        this.observer.observe(scroller, { childList: true, subtree: true });
      }
    }
    this.refresh();
    this.tree.setActive(this.viewActive);
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
    const complete =
      snapshot.complete && snapshot.count <= OUTLINE_DEFAULTS.completeTreeLimit;
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
          else if (!node.isLeaf) this.loadVisibleChildren(node.id);
        }
      });
    visit(this.roots, 0);
    this.rebuild();
    this.scheduleSync();
  }

  private rebuild() {
    this.treeRevision++;
    this.render();
  }

  private loadVisibleChildren(id: string) {
    const version = this.version;
    void this.loadChildren(id).catch((error) => {
      if (!this.closed && version === this.version) this.base.onError(error);
    });
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
        this.rebuild();
      });
    this.loading.set(id, task);
    this.rebuild();
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
    this.active = node.id;
    this.navigating++;
    this.render();
    // 点击只定位正文，不把已在视野内的目录项再次强制居中。
    void this.navigate(node.targetBlockId)
      .catch(this.base.onError)
      .finally(() => {
        this.navigating--;
      });
  }

  private render() {
    if (this.closed) return;
    const en = this.base.locale === 'en-US';
    this.element.setAttribute(
      'aria-label',
      en ? 'Document outline' : '文档大纲',
    );
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
    this.tree.setLocale(this.base.locale);
    this.tree.update({
      revision: this.treeRevision,
      roots: this.roots,
      expanded: this.expanded,
      loading: new Set(this.loading.keys()),
      selectedId: this.active,
    });
  }

  private scheduleSync = () => {
    if (
      this.closed ||
      !this.viewActive ||
      this.element.hidden ||
      !this.scroller ||
      this.navigating
    )
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
    let changed = false;
    for (const parent of ancestors) {
      if (!this.expanded.has(parent)) {
        this.expanded.add(parent);
        changed = true;
      }
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
    // 正文滚动只改变选择时复用行索引，避免每个标题切换都遍历整棵树。
    if (changed) this.treeRevision++;
    this.render();
    this.tree.reveal(id, { align: 'reading' });
  }

  /** 切换侧栏可见性时保留状态，并阻止隐藏后迟到的阅读同步。 */
  update(visible: boolean) {
    if (this.closed) return;
    const changed = this.element.hidden === visible;
    this.element.hidden = !visible;
    this.tree.setActive(visible && this.viewActive);
    if (!visible) {
      this.cancel?.();
      this.cancel = undefined;
      this.revealing++;
    }
    if (visible && changed) this.refresh();
    else if (visible) this.render();
  }
  /** 停用时暂停树和正文同步，恢复不丢失用户展开状态。 */
  setActive(active: boolean) {
    if (this.closed) return;
    this.viewActive = active;
    this.tree.setActive(active && !this.element.hidden);
    if (active) {
      if (this.scroller)
        this.observer?.observe(this.scroller, {
          childList: true,
          subtree: true,
        });
      this.scheduleSync();
    } else {
      this.observer?.disconnect();
      this.cancel?.();
      this.cancel = undefined;
      this.revealing++;
    }
  }
  /** 释放 Provider 订阅、公共树及本侧栏拥有的观察器。 */
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.version++;
    this.revealing++;
    this.cancel?.();
    this.stop();
    this.tree.dispose();
    this.observer?.disconnect();
    this.scroller?.removeEventListener('scroll', this.scheduleSync);
    this.resize.dispose();
    this.element.remove();
  }
}
