import type { WordOutlineProvider } from '../../engine/word/WordOutlineProvider';
import type { WordOutlineTreeNode } from '../../engine/word/types';
import type { OfficeRenderContext } from '../../view/types';
import { mountSidebarResize } from '../common/SidebarResize';
import { setOfficeIconButton } from '../../view/ui';
/** 大纲按 Provider 懒取子节点，并仅构建侧栏可见行，定位复用正文分页导航。 */
export class WordOutline {
  readonly element: HTMLElement;
  private list: HTMLDivElement;
  private canvas: HTMLDivElement;
  private title: HTMLButtonElement;
  private count: HTMLSpanElement;
  private find: HTMLButtonElement;
  private close: HTMLButtonElement;
  private expanded = new Set<string>();
  private children = new Map<string, WordOutlineTreeNode[]>();
  private closed = false;
  private stop: () => void;
  private resize: ReturnType<typeof mountSidebarResize>;
  private active = '';
  private rows: WordOutlineTreeNode[] = [];
  constructor(
    private readonly provider: WordOutlineProvider,
    private readonly base: OfficeRenderContext,
    private readonly navigate: (id: string) => Promise<boolean>,
  ) {
    const doc = base.document;
    this.element = doc.createElement('aside');
    this.element.className = 'fivo-native-word-outline';
    const header = doc.createElement('header');
    this.title = doc.createElement('button');
    this.title.type = 'button';
    this.title.className = 'fivo-native-tab fivo-native-tab--active';
    this.title.setAttribute('aria-pressed', 'true');
    this.count = doc.createElement('span');
    this.count.className = 'fivo-native-count';
    const find = (this.find = doc.createElement('button')),
      close = (this.close = doc.createElement('button'));
    find.className = 'fivo-native-tab';
    find.type = close.type = 'button';
    find.textContent = base.locale === 'en-US' ? 'Find' : '查找';
    setOfficeIconButton(
      close,
      base.locale === 'en-US' ? 'Close' : '关闭',
      'close',
    );
    find.onclick = () => {
      void base.services.state.execute({ type: 'search', open: true });
    };
    close.onclick = () => {
      void base.services.state.execute({ type: 'outline', open: false });
    };
    header.append(this.title, find, this.count, close);
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
    this.refresh();
  }
  private refresh() {
    this.rows = [];
    const visit = (nodes: WordOutlineTreeNode[]) => {
      for (const node of nodes) {
        this.rows.push(node);
        if (this.expanded.has(node.id))
          visit(this.children.get(node.id) ?? node.children ?? []);
      }
    };
    visit(this.provider.getRoots(1));
    this.render();
  }
  private render() {
    if (this.closed) return;
    const en = this.base.locale === 'en-US';
    this.title.textContent = en ? 'Outline' : '大纲';
    this.find.textContent = en ? 'Find' : '查找';
    this.count.textContent = String(this.provider.getSnapshot().count);
    this.count.title = en ? 'Headings' : '大纲条目数';
    setOfficeIconButton(this.close, en ? 'Close' : '关闭', 'close');
    this.resize?.setLabel(en ? 'Resize outline' : '调整大纲宽度');
    const height = 34,
      start = Math.max(0, Math.floor(this.list.scrollTop / height) - 3),
      end = Math.min(
        this.rows.length,
        start + Math.ceil((this.list.clientHeight || 500) / height) + 6,
      );
    this.canvas.style.height = this.rows.length * height + 'px';
    this.canvas.replaceChildren();
    for (let index = start; index < end; index++) {
      const node = this.rows[index],
        row = this.base.document.createElement('div');
      row.className = 'fivo-native-outline-row';
      row.style.top = index * height + 'px';
      row.style.paddingLeft = Math.max(0, node.level) * 12 + 'px';
      row.setAttribute('role', 'treeitem');
      row.setAttribute('aria-level', String(node.level + 1));
      row.setAttribute('aria-selected', String(node.id === this.active));
      if (!node.isLeaf) {
        row.setAttribute('aria-expanded', String(this.expanded.has(node.id)));
        const toggle = this.base.document.createElement('button');
        toggle.type = 'button';
        setOfficeIconButton(
          toggle,
          (this.expanded.has(node.id)
            ? en
              ? 'Collapse '
              : '收起 '
            : en
            ? 'Expand '
            : '展开 ') + node.text,
          this.expanded.has(node.id) ? 'down' : 'right',
        );
        toggle.setAttribute(
          'aria-label',
          (this.expanded.has(node.id)
            ? en
              ? 'Collapse '
              : '收起 '
            : en
            ? 'Expand '
            : '展开 ') + node.text,
        );
        toggle.onclick = () => {
          if (this.expanded.has(node.id)) {
            this.expanded.delete(node.id);
            this.refresh();
          } else {
            this.expanded.add(node.id);
            void this.provider
              .getChildren(node.id)
              .then((children) => {
                if (this.closed) return;
                this.children.set(node.id, children);
                this.refresh();
              })
              .catch(this.base.onError);
          }
        };
        row.append(toggle);
      }
      const button = this.base.document.createElement('button');
      button.type = 'button';
      button.className = 'fivo-native-outline-label';
      if (node.isLeaf) button.classList.add('fivo-native-outline-label--leaf');
      button.textContent = node.text;
      button.title = node.text;
      button.onclick = () => {
        this.active = node.id;
        this.render();
        void this.navigate(node.targetBlockId).catch(this.base.onError);
      };
      row.append(button);
      this.canvas.append(row);
    }
  }
  update(visible: boolean) {
    this.element.hidden = !visible;
    if (visible) this.refresh();
  }
  dispose() {
    this.closed = true;
    this.stop();
    this.resize.dispose();
    this.element.remove();
  }
}
