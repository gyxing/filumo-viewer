import { OutlineTree, OUTLINE_DEFAULTS } from '@filumo/dom/outline';
import type { StylePolicy } from '@filumo/dom';
import type { XmlDocument, XmlNode } from '../parser/types';
import { xmlChildren, xmlNodeLabel } from './xmlRows';
import { renderXmlLabel } from './xmlLabel';

/** XML 使用独立模型适配公共树视图，属性和混合文本仍是各自真实节点。 */
export class XmlTree {
  readonly element: HTMLElement;
  private tree: OutlineTree<XmlNode>;
  private expanded = new Set<string>();
  private selected?: string;
  private revision = 0;
  private whitespace = false;
  private children = new Map<string, XmlNode[]>();
  private active = true;
  private roots: XmlNode[];
  constructor(
    private model: XmlDocument,
    document: Document,
    private reveal: (range: { start: number; end: number }) => void,
    private change: () => void,
    locale?: 'zh-CN' | 'en-US',
    stylePolicy?: StylePolicy,
  ) {
    this.roots = this.getChildren(model.nodes[0]);
    this.selected =
      this.roots.find((node) => node.kind === 'element')?.id ??
      this.roots[0]?.id;
    for (const node of model.nodes)
      if (
        node.kind !== 'document' &&
        node.childIds.length &&
        (model.nodes.length <= OUTLINE_DEFAULTS.completeTreeLimit ||
          node.parentId === model.rootId)
      )
        this.expanded.add(node.id);
    this.tree = new OutlineTree({
      document,
      locale,
      stylePolicy,
      renderLabel: renderXmlLabel,
      accessors: {
        getId: (node: XmlNode) => node.id,
        getText: xmlNodeLabel,
        isLeaf: (node) => !this.getChildren(node).length,
        getChildren: (node) => this.getChildren(node),
      },
      onToggle: (id, expanded) => {
        if (expanded) this.expanded.add(id);
        else this.expanded.delete(id);
        this.revision++;
        this.publish();
        this.change();
      },
      onActivate: (id) => {
        this.selected = id;
        this.publish();
        const node = this.model.nodes[Number(id)];
        this.reveal({ start: node.start, end: node.end });
        this.change();
      },
    });
    this.element = this.tree.element;
    this.element.className += ' filumo-xml-tree';
    this.publish();
  }
  private getChildren(node: XmlNode) {
    let children = this.children.get(node.id);
    if (!children) {
      children = xmlChildren(this.model, node, this.whitespace);
      this.children.set(node.id, children);
    }
    return children;
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
  update(whitespace: boolean, locale?: 'zh-CN' | 'en-US', zoom = 100): void {
    if (this.whitespace !== whitespace) {
      this.whitespace = whitespace;
      this.children.clear();
      this.roots = this.getChildren(this.model.nodes[0]);
      if (
        !whitespace &&
        this.selected &&
        this.model.nodes[Number(this.selected)]?.whitespace
      )
        this.selected = this.model.nodes[Number(this.selected)].parentId;
      this.revision++;
      this.publish();
    }
    this.tree.setLocale(locale);
    this.element.setAttribute(
      'aria-label',
      locale === 'en-US' ? 'XML structure' : 'XML 结构',
    );
    this.tree.setScale(zoom / 100);
    this.element.style.fontSize = (14 * zoom) / 100 + 'px';
  }
  /** 原文查找选择只更新树，不反向跳转正文。 */
  revealNode(id: string): void {
    let node = this.model.nodes[Number(id)];
    if (!node) return;
    if (!this.whitespace && node.whitespace && node.parentId)
      node = this.model.nodes[Number(node.parentId)];
    if (node.kind === 'document') return;
    const changed = this.selected !== node.id;
    this.selected = node.id;
    let parent = node.parentId;
    while (parent && parent !== this.model.rootId) {
      if (!this.expanded.has(parent)) {
        this.expanded.add(parent);
        this.revision++;
      }
      parent = this.model.nodes[Number(parent)].parentId;
    }
    this.publish();
    if (changed && this.active) this.tree.reveal(node.id);
    this.change();
  }
  getBranchState() {
    const node = this.selected
      ? this.model.nodes[Number(this.selected)]
      : undefined;
    return {
      canToggle: !!node && !!this.getChildren(node).length,
      expanded: !!node && this.expanded.has(node.id),
    };
  }
  toggleBranch(): void {
    const state = this.getBranchState();
    if (!this.selected || !state.canToggle) return;
    if (state.expanded) this.expanded.delete(this.selected);
    else this.expanded.add(this.selected);
    this.revision++;
    this.publish();
    this.change();
  }
  setActive(active: boolean): void {
    this.active = active;
    this.tree.setActive(active);
  }
  dispose(): void {
    this.tree.dispose();
    this.children.clear();
    this.expanded.clear();
    this.roots = [];
  }
}
