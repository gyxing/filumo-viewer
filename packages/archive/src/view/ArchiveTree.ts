import type { ViewContext } from '@filumo/dom';
import { OutlineTree } from '@filumo/dom/outline';
import type { ArchiveEntry } from '../reader/contracts';
export interface ArchiveNode {
  id: string;
  text: string;
  path: string;
  entry?: ArchiveEntry;
  children: ArchiveNode[];
}
/** 目录树仅发布用户意图，实际导航和条目提取仍由归档视图管理。 */
export class ArchiveTree {
  readonly tree: OutlineTree<ArchiveNode>;
  private nodes = new Map<string, ArchiveNode>();
  private roots: ArchiveNode[] = [];
  private revision = 0;
  private expanded = new Set<string>();
  constructor(
    context: ViewContext,
    private activate: (node: ArchiveNode) => void,
  ) {
    this.tree = new OutlineTree({
      document: context.container.ownerDocument,
      locale: context.options.locale,
      stylePolicy: context.stylePolicy,
      accessors: {
        getId: (n) => n.id,
        getText: (n) => n.text,
        isLeaf: (n) => !!n.entry && n.entry.kind !== 'directory',
        getChildren: (n) => n.children,
      },
      onToggle: (id, shown) => {
        if (shown) this.expanded.add(id);
        else this.expanded.delete(id);
        this.revision++;
        this.publish();
      },
      onActivate: (id) => {
        const node = this.nodes.get(id);
        if (node) this.activate(node);
      },
    });
    this.tree.element.setAttribute(
      'aria-label',
      context.options.locale === 'en-US' ? 'Archive files' : '压缩包文件',
    );
  }
  rebuild(entries: readonly ArchiveEntry[], expanded: Set<string>, query = '') {
    const match = query.trim().toLocaleLowerCase();
    // 筛选时临时展开匹配路径，清空后恢复用户原来的展开状态。
    this.expanded = match ? new Set(expanded) : expanded;
    this.nodes.clear();
    this.roots = [];
    const directories = new Map<string, ArchiveNode>();
    const directory = (path: string): ArchiveNode => {
      let found = directories.get(path);
      if (found) return found;
      const parts = path.split('/'),
        name = parts.pop()!;
      found = { id: 'dir:' + path, text: name, path, children: [] };
      directories.set(path, found);
      this.nodes.set(found.id, found);
      if (match) this.expanded.add(found.id);
      const parent = parts.join('/');
      if (parent) directory(parent).children.push(found);
      else this.roots.push(found);
      return found;
    };
    for (const entry of entries) {
      if (entry.error) continue;
      if (match && !entry.path.toLocaleLowerCase().includes(match)) continue;
      if (entry.kind === 'directory') {
        directory(entry.path);
        continue;
      }
      const parts = entry.path.split('/'),
        text = parts.pop()!,
        parent = parts.join('/');
      const node = {
        id: 'file:' + entry.id,
        text,
        path: entry.path,
        entry,
        children: [],
      };
      this.nodes.set(node.id, node);
      if (parent) directory(parent).children.push(node);
      else this.roots.push(node);
    }
    const sort = (nodes: ArchiveNode[]) => {
      nodes.sort(
        (a, b) =>
          Number(!!a.entry) - Number(!!b.entry) || a.text.localeCompare(b.text),
      );
      for (const node of nodes) sort(node.children);
    };
    sort(this.roots);
    this.revision++;
    this.publish();
  }
  publish(selected?: string) {
    this.tree.update({
      revision: this.revision,
      roots: this.roots,
      expanded: this.expanded,
      loading: new Set(),
      selectedId: selected,
    });
  }
  dispose() {
    this.tree.dispose();
    this.nodes.clear();
  }
}
