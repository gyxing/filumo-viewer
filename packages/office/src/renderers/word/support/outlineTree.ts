import type { WordOutlineTreeNode } from '../../../engine/word/types';

export interface OutlineRow {
  node: WordOutlineTreeNode;
  depth: number;
  parentId?: string;
  siblingIndex: number;
  siblingCount: number;
  hasNextSibling: boolean;
  ancestorHasNextSibling: boolean[];
}

/** 展开可见树并保留分支信息，标题级别跳跃不影响真实树深度和连接线。 */
export function flattenOutlineRows(
  roots: readonly WordOutlineTreeNode[],
  expanded: ReadonlySet<string>,
  children: ReadonlyMap<string, WordOutlineTreeNode[]>,
): OutlineRow[] {
  const rows: OutlineRow[] = [];
  const visit = (
    nodes: readonly WordOutlineTreeNode[],
    depth: number,
    ancestorHasNextSibling: boolean[],
    parentId?: string,
  ) => {
    nodes.forEach((node, siblingIndex) => {
      const hasNextSibling = siblingIndex < nodes.length - 1;
      rows.push({
        node,
        depth,
        parentId,
        siblingIndex,
        siblingCount: nodes.length,
        hasNextSibling,
        ancestorHasNextSibling,
      });
      if (expanded.has(node.id))
        visit(
          children.get(node.id) ?? node.children ?? [],
          depth + 1,
          [...ancestorHasNextSibling, hasNextSibling],
          node.id,
        );
    });
  };
  visit(roots, 0, []);
  return rows;
}
