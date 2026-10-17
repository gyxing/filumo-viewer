import type { MarkdownHeading } from '../parser/types';

export interface MarkdownOutlineNode {
  heading: MarkdownHeading;
  parentId?: string;
  children: MarkdownOutlineNode[];
}
export interface MarkdownOutlineRow {
  node: MarkdownOutlineNode;
  depth: number;
  hasNextSibling: boolean;
  siblingIndex: number;
  siblingCount: number;
  ancestorHasNextSibling: boolean[];
}

/** 最近的较浅标题作为父级，标题跳级不生成空白层级。 */
export function buildMarkdownOutlineTree(headings: readonly MarkdownHeading[]) {
  const roots: MarkdownOutlineNode[] = [],
    nodes = new Map<string, MarkdownOutlineNode>(),
    stack: MarkdownOutlineNode[] = [];
  for (const heading of headings) {
    while (
      stack.length && stack[stack.length - 1].heading.depth >= heading.depth
    )
      stack.pop();
    const parent = stack[stack.length - 1];
    const node: MarkdownOutlineNode = {
      heading,
      parentId: parent?.heading.id,
      children: [],
    };
    (parent?.children ?? roots).push(node);
    nodes.set(heading.id, node);
    stack.push(node);
  }
  return { roots, nodes };
}

/** 只展开可见分支，保留祖先和末节点信息以绘制连续的连接线。 */
export function markdownOutlineRows(
  roots: readonly MarkdownOutlineNode[],
  expanded: ReadonlySet<string>,
) {
  const rows: MarkdownOutlineRow[] = [];
  const visit = (
    nodes: readonly MarkdownOutlineNode[],
    depth: number,
    ancestorHasNextSibling: boolean[],
  ) => {
    nodes.forEach((node, siblingIndex) => {
      const hasNextSibling = siblingIndex < nodes.length - 1;
      rows.push({
        node,
        depth,
        hasNextSibling,
        siblingIndex,
        siblingCount: nodes.length,
        ancestorHasNextSibling,
      });
      if (expanded.has(node.heading.id))
        visit(node.children, depth + 1, [
          ...ancestorHasNextSibling,
          hasNextSibling,
        ]);
    });
  };
  visit(roots, 0, []);
  return rows;
}
