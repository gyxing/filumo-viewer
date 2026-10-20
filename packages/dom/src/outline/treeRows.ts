import type {
  OutlineAccessors,
  OutlineRow,
  OutlineSnapshot,
} from './contracts';

/** 展开已加载的可见分支并保存连线信息，显式栈避免源文档层级耗尽调用栈。 */
export function buildOutlineRows<TNode>(
  snapshot: OutlineSnapshot<TNode>,
  accessors: OutlineAccessors<TNode>,
): OutlineRow<TNode>[] {
  const rows: OutlineRow<TNode>[] = [];
  const stack: Array<{
    nodes: readonly TNode[];
    index: number;
    depth: number;
    parentId?: string;
    ancestors: readonly boolean[];
  }> = [{ nodes: snapshot.roots, index: 0, depth: 0, ancestors: [] }];
  while (stack.length) {
    const frame = stack[stack.length - 1];
    if (frame.index >= frame.nodes.length) {
      stack.pop();
      continue;
    }
    const siblingIndex = frame.index++,
      node = frame.nodes[siblingIndex];
    const id = accessors.getId(node),
      leaf = accessors.isLeaf(node);
    const hasNextSibling = siblingIndex + 1 < frame.nodes.length;
    const expanded = !leaf && snapshot.expanded.has(id);
    rows.push({
      node,
      id,
      text: accessors.getText(node),
      parentId: frame.parentId,
      depth: frame.depth,
      isLeaf: leaf,
      expanded,
      loading: snapshot.loading.has(id),
      siblingIndex,
      siblingCount: frame.nodes.length,
      hasNextSibling,
      ancestorHasNextSibling: frame.ancestors,
    });
    const children = expanded ? accessors.getChildren(node) : undefined;
    if (children?.length)
      stack.push({
        nodes: children,
        index: 0,
        depth: frame.depth + 1,
        parentId: id,
        ancestors: [...frame.ancestors, hasNextSibling],
      });
  }
  return rows;
}
