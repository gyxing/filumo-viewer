import type { StylePolicy } from '@filumo/dom';
import { OUTLINE_DEFAULTS, OutlineTree } from '@filumo/dom/outline';
import type { MarkdownHeading } from '../parser/types';
import { OutlineResize } from './OutlineResize';
import './outline.less';
import {
  buildMarkdownOutlineTree,
  type MarkdownOutlineNode,
} from './outlineTree';

/** 原生树形大纲独立于 Office 引擎，维护分支、选择与键盘状态。 */
export class MarkdownOutline {
  readonly element: HTMLElement;
  private tree: OutlineTree<MarkdownOutlineNode>;
  private revision = 0;
  private roots: MarkdownOutlineNode[];
  private nodes: Map<string, MarkdownOutlineNode>;
  private expanded = new Set<string>();
  private selected = '';
  private active = true;
  private closed = false;
  private resize: OutlineResize;
  constructor(
    document: Document,
    headings: readonly MarkdownHeading[],
    private goTo: (id: string) => void,
    en: boolean,
    onClose: () => void,
    stylePolicy?: StylePolicy,
  ) {
    const tree = buildMarkdownOutlineTree(headings);
    this.roots = tree.roots;
    this.nodes = tree.nodes;
    for (const node of this.nodes.values())
      if (
        node.children.length &&
        (headings.length <= OUTLINE_DEFAULTS.completeTreeLimit ||
          !node.parentId)
      )
        this.expanded.add(node.heading.id);
    this.selected = headings[0]?.id ?? '';
    this.element = document.createElement('nav');
    this.element.className = 'filumo-markdown-outline';
    this.element.setAttribute('aria-label', en ? 'Outline' : '大纲');
    const header = document.createElement('header'),
      title = document.createElement('span'),
      count = document.createElement('span'),
      close = document.createElement('button');
    header.className = 'filumo-markdown-outline-header';
    title.className = 'filumo-markdown-outline-heading';
    title.textContent = en ? 'Outline' : '大纲';
    count.className = 'filumo-markdown-outline-count';
    count.textContent = String(headings.length);
    count.title = en ? 'Headings' : '大纲条目数';
    close.type = 'button';
    close.className = 'filumo-markdown-outline-close';
    close.title = en ? 'Collapse outline' : '收起大纲';
    close.setAttribute('aria-label', close.title);
    close.onclick = onClose;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
      path = document.createElementNS(svg.namespaceURI, 'path');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    path.setAttribute('d', 'M3 4h18v16H3zM8 4v16m8-12-4 4 4 4');
    svg.append(path);
    close.append(svg);
    header.append(title, count, close);
    this.tree = new OutlineTree({
      document,
      locale: en ? 'en-US' : 'zh-CN',
      stylePolicy,
      accessors: {
        getId: (node: MarkdownOutlineNode) => node.heading.id,
        getText: (node) => node.heading.title,
        isLeaf: (node) => !node.children.length,
        getChildren: (node) => node.children,
      },
      onToggle: (id, expanded) => {
        if (expanded) this.expanded.add(id);
        else this.expanded.delete(id);
        this.rebuild();
      },
      onActivate: (id) => {
        this.selected = id;
        this.publish();
        this.goTo(id);
      },
    });
    this.element.append(header, this.tree.element);
    this.resize = new OutlineResize(this.element, en);
    this.rebuild();
  }
  private publish() {
    this.tree.update({
      revision: this.revision,
      roots: this.roots,
      expanded: this.expanded,
      loading: new Set(),
      selectedId: this.selected,
    });
  }
  private rebuild() {
    this.revision++;
    this.publish();
  }
  /** 正文只同步选择和必要祖先，不通过公共树反向激活正文。 */
  setCurrent(id: string) {
    const node = this.nodes.get(id);
    if (!node || id === this.selected || this.closed) return;
    this.selected = id;
    let parentId = node.parentId,
      changed = false;
    while (parentId) {
      if (!this.expanded.has(parentId)) {
        this.expanded.add(parentId);
        changed = true;
      }
      parentId = this.nodes.get(parentId)?.parentId;
    }
    if (changed) this.revision++;
    this.publish();
    this.tree.reveal(id);
  }
  /** 关闭保留分支、宽度和列表位置，重新展开时复用原树。 */
  setOpen(open: boolean) {
    if (this.closed) return;
    this.element.hidden = !open;
    this.resize.setActive(open && this.active);
    this.tree.setActive(open && this.active);
  }
  /** 停用不保留测量和尺寸拖动任务。 */
  setActive(active: boolean) {
    if (this.closed) return;
    this.active = active;
    this.resize.setActive(active && !this.element.hidden);
    this.tree.setActive(active && !this.element.hidden);
  }
  /** 清理公共树和当前格式拥有的宽度适配器。 */
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.resize.dispose();
    this.tree.dispose();
    this.element.remove();
  }
}
