import type { MarkdownHeading } from '../parser/types';
import { OutlineResize } from './OutlineResize';
import {
  buildMarkdownOutlineTree,
  markdownOutlineRows,
  type MarkdownOutlineNode,
  type MarkdownOutlineRow,
} from './outlineTree';
import './outline.less';

// 与 DOCX 对齐行高、真实层级缩进和小树默认展开策略。
const ROW_HEIGHT = 28;
const INDENT = 16;
const COMPLETE_TREE_LIMIT = 200;

/** 原生树形大纲独立于 Office 引擎，维护分支、选择与键盘状态。 */
export class MarkdownOutline {
  readonly element: HTMLElement;
  private list: HTMLElement;
  private canvas: HTMLElement;
  private roots: MarkdownOutlineNode[];
  private nodes: Map<string, MarkdownOutlineNode>;
  private rows: MarkdownOutlineRow[] = [];
  private expanded = new Set<string>();
  private selected = '';
  private focused = '';
  private active = true;
  private closed = false;
  private resize: OutlineResize;
  private observer?: ResizeObserver;
  constructor(
    private document: Document,
    headings: readonly MarkdownHeading[],
    private goTo: (id: string) => void,
    private en: boolean,
    onClose: () => void,
  ) {
    const tree = buildMarkdownOutlineTree(headings);
    this.roots = tree.roots;
    this.nodes = tree.nodes;
    for (const node of this.nodes.values())
      if (
        node.children.length &&
        (headings.length <= COMPLETE_TREE_LIMIT || !node.parentId)
      )
        this.expanded.add(node.heading.id);
    this.selected = this.focused = headings[0]?.id ?? '';
    this.element = document.createElement('nav');
    this.element.className = 'fivo-markdown-outline';
    this.element.setAttribute('aria-label', en ? 'Outline' : '大纲');
    const header = document.createElement('header'),
      title = document.createElement('span'),
      count = document.createElement('span'),
      close = document.createElement('button');
    header.className = 'fivo-markdown-outline-header';
    title.className = 'fivo-markdown-outline-heading';
    title.textContent = en ? 'Outline' : '大纲';
    count.className = 'fivo-markdown-outline-count';
    count.textContent = String(headings.length);
    count.title = en ? 'Headings' : '大纲条目数';
    close.type = 'button';
    close.className = 'fivo-markdown-outline-close';
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
    this.list = document.createElement('div');
    this.list.className = 'fivo-markdown-outline-list';
    this.list.setAttribute('role', 'tree');
    this.list.setAttribute('aria-label', en ? 'Headings' : '大纲条目');
    this.canvas = document.createElement('div');
    this.canvas.className = 'fivo-markdown-outline-canvas';
    this.list.append(this.canvas);
    this.list.onscroll = () => this.render();
    this.element.append(header, this.list);
    this.resize = new OutlineResize(this.element, en);
    const Observer = document.defaultView?.ResizeObserver;
    if (Observer) {
      this.observer = new Observer(() => this.render());
      this.observer.observe(this.list);
    }
    this.rebuild();
  }
  private rebuild() {
    this.rows = markdownOutlineRows(this.roots, this.expanded);
    this.canvas.style.height = this.rows.length * ROW_HEIGHT + 'px';
    this.list.scrollTop = Math.max(
      0,
      Math.min(
        this.list.scrollTop,
        this.rows.length * ROW_HEIGHT - this.list.clientHeight,
      ),
    );
    this.render();
  }
  private keepVisible(index: number) {
    const top = index * ROW_HEIGHT;
    if (top < this.list.scrollTop) this.list.scrollTop = top;
    else if (top + ROW_HEIGHT > this.list.scrollTop + this.list.clientHeight)
      this.list.scrollTop = top + ROW_HEIGHT - this.list.clientHeight;
  }
  private focusRow(index: number) {
    const row = this.rows[Math.max(0, Math.min(this.rows.length - 1, index))];
    if (!row) return;
    this.focused = row.node.heading.id;
    this.keepVisible(this.rows.indexOf(row));
    this.render();
    for (const child of Array.from(this.canvas.children))
      if ((child as HTMLElement).dataset.outlineId === this.focused)
        (child as HTMLElement).focus({ preventScroll: true });
  }
  private toggle(node: MarkdownOutlineNode) {
    const id = node.heading.id;
    if (this.expanded.has(id)) this.expanded.delete(id);
    else this.expanded.add(id);
    this.focused = id;
    this.rebuild();
  }
  private select(node: MarkdownOutlineNode) {
    this.selected = this.focused = node.heading.id;
    this.render();
    this.goTo(node.heading.id);
  }
  private key(event: KeyboardEvent, index: number) {
    const row = this.rows[index];
    if (!row) return;
    const { node } = row;
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
        if (node.children.length && !this.expanded.has(node.heading.id))
          this.toggle(node);
        else if (this.rows[index + 1]?.node.parentId === node.heading.id)
          this.focusRow(index + 1);
        break;
      case 'ArrowLeft':
        if (node.children.length && this.expanded.has(node.heading.id))
          this.toggle(node);
        else if (node.parentId)
          this.focusRow(
            this.rows.findIndex(
              (item) => item.node.heading.id === node.parentId,
            ),
          );
        break;
      case 'Enter':
      case ' ':
        this.select(node);
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  }
  private render() {
    if (this.closed || !this.active || this.element.hidden) return;
    const focusInside = this.list.contains(this.document.activeElement);
    const start = Math.max(0, Math.floor(this.list.scrollTop / ROW_HEIGHT) - 8),
      end = Math.min(
        this.rows.length,
        Math.ceil(
          (this.list.scrollTop + (this.list.clientHeight || 400)) / ROW_HEIGHT,
        ) + 8,
      );
    if (
      !focusInside &&
      !this.rows.slice(start, end).some(
        (item) => item.node.heading.id === this.focused,
      )
    )
      this.focused = this.rows[start]?.node.heading.id ?? '';
    this.canvas.replaceChildren();
    for (let index = start; index < end; index++) {
      const item = this.rows[index],
        { node, depth } = item,
        id = node.heading.id,
        leaf = !node.children.length,
        row = this.document.createElement('div');
      row.className = 'fivo-markdown-outline-row';
      row.dataset.outlineId = id;
      row.style.top = index * ROW_HEIGHT + 'px';
      row.style.paddingLeft = depth * INDENT + 'px';
      row.tabIndex = id === this.focused ? 0 : -1;
      row.setAttribute('role', 'treeitem');
      row.setAttribute('aria-label', node.heading.title);
      row.setAttribute('aria-level', String(depth + 1));
      row.setAttribute('aria-posinset', String(item.siblingIndex + 1));
      row.setAttribute('aria-setsize', String(item.siblingCount));
      row.setAttribute('aria-selected', String(id === this.selected));
      row.onclick = () => this.select(node);
      row.onkeydown = (event) => this.key(event, index);
      if (depth) {
        const guides = this.document.createElement('span');
        guides.className = 'fivo-markdown-outline-guides';
        guides.setAttribute('aria-hidden', 'true');
        item.ancestorHasNextSibling.slice(1).forEach((continues, level) => {
          if (!continues) return;
          const guide = this.document.createElement('span');
          guide.className = 'fivo-markdown-outline-guide';
          guide.style.left = level * INDENT + 10 + 'px';
          guides.append(guide);
        });
        const branch = this.document.createElement('span');
        branch.className = 'fivo-markdown-outline-branch';
        branch.dataset.continues = String(item.hasNextSibling);
        branch.dataset.leaf = String(leaf);
        branch.style.left = (depth - 1) * INDENT + 10 + 'px';
        guides.append(branch);
        row.append(guides);
      }
      const switcher = this.document.createElement(leaf ? 'span' : 'button');
      switcher.className = leaf
        ? 'fivo-markdown-outline-leaf'
        : 'fivo-markdown-outline-switcher';
      if (leaf) switcher.setAttribute('aria-hidden', 'true');
      else {
        const expanded = this.expanded.has(id);
        row.setAttribute('aria-expanded', String(expanded));
        (switcher as HTMLButtonElement).type = 'button';
        switcher.tabIndex = -1;
        switcher.dataset.expanded = String(expanded);
        switcher.dataset.hasChildren = String(
          this.rows[index + 1]?.node.parentId === id,
        );
        switcher.setAttribute(
          'aria-label',
          (expanded
            ? this.en ? 'Collapse ' : '收起 '
            : this.en ? 'Expand ' : '展开 ') + node.heading.title,
        );
        const icon = this.document.createElement('span');
        icon.setAttribute('aria-hidden', 'true');
        switcher.append(icon);
        switcher.onclick = (event) => {
          event.stopPropagation();
          this.toggle(node);
          this.focusRow(index);
        };
      }
      const label = this.document.createElement('span');
      label.className = 'fivo-markdown-outline-label';
      label.textContent = label.title = node.heading.title;
      row.append(switcher, label);
      this.canvas.append(row);
      if (focusInside && id === this.focused)
        row.focus({ preventScroll: true });
    }
  }
  /** 正文滚动只同步选中态和必要祖先，不触发反向正文定位。 */
  setCurrent(id: string) {
    const node = this.nodes.get(id);
    if (!node || id === this.selected || this.closed) return;
    this.selected = id;
    const focusInside = this.list.contains(this.document.activeElement);
    let parentId = node.parentId;
    while (parentId) {
      this.expanded.add(parentId);
      parentId = this.nodes.get(parentId)?.parentId;
    }
    this.rebuild();
    this.keepVisible(this.rows.findIndex((item) => item.node.heading.id === id));
    if (!focusInside) this.focused = id;
    this.render();
  }
  /** 关闭仍保留分支和宽度，阅读实例销毁时才释放。 */
  setOpen(open: boolean) {
    if (this.closed) return;
    this.element.hidden = !open;
    this.resize.setActive(open && this.active);
    if (open) this.render();
  }
  /** 停用期间不重绘，也不保留正在进行的尺寸拖动。 */
  setActive(active: boolean) {
    if (this.closed) return;
    this.active = active;
    this.resize.setActive(active && !this.element.hidden);
    this.observer?.disconnect();
    if (active) {
      this.observer?.observe(this.list);
      this.render();
    }
  }
  /** 清理事件、尺寸观察及虚拟节点。 */
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.resize.dispose();
    this.observer?.disconnect();
    this.list.onscroll = null;
    this.element.remove();
  }
}
