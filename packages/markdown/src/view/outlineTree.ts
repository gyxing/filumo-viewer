import type { MarkdownHeading } from '../parser/types';

export interface MarkdownOutlineNode {
  heading: MarkdownHeading;
  parentId?: string;
  children: MarkdownOutlineNode[];
}

/** 最近的较浅标题作为父级，标题跳级不生成空白层级。 */
export function buildMarkdownOutlineTree(headings: readonly MarkdownHeading[]) {
  const roots: MarkdownOutlineNode[] = [],
    nodes = new Map<string, MarkdownOutlineNode>(),
    stack: MarkdownOutlineNode[] = [];
  for (const heading of headings) {
    while (
      stack.length &&
      stack[stack.length - 1].heading.depth >= heading.depth
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
