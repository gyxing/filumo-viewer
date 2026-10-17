import type { JsonDocument, JsonNode } from '../parser/types';

/** 仅为可见行计算祖先是否还有后续兄弟，不为整树复制连接线状态。 */
export function jsonTreeGuides(model: JsonDocument, id: string): boolean[] {
  const guides: boolean[] = [];
  let node = model.nodes[Number(id)];
  while (node.parentId !== undefined) {
    const parent = model.nodes[Number(node.parentId)];
    const sibling = parent.type === 'property' ? parent : node;
    const container =
      parent.type === 'property'
        ? model.nodes[Number(parent.parentId)]
        : parent;
    guides.push(
      container.childIds[container.childIds.length - 1] !== sibling.id,
    );
    node = container;
  }
  return guides.reverse();
}

/** 联动范围使用源位置；容器只强调键名和起始括号，不覆盖整篇代码。 */
export function jsonNodeRange(model: JsonDocument, id: string) {
  const node = model.nodes[Number(id)];
  const parent =
    node.parentId === undefined
      ? undefined
      : model.nodes[Number(node.parentId)];
  const start = parent?.type === 'property' ? parent.start : node.start;
  return {
    start,
    end:
      node.type === 'array' || node.type === 'object'
        ? node.start + 1
        : node.end,
  };
}

/** 摘要保留原始数字和转义，省略号只影响树内展示，完整原文由代码区提供。 */
export function jsonNodePreview(model: JsonDocument, node: JsonNode): string {
  if (node.type === 'object') return 'Object (' + node.childIds.length + ')';
  if (node.type === 'array') return 'Array (' + node.childIds.length + ')';
  let end = Math.min(node.end, node.start + 400);
  const last = model.text.charCodeAt(end - 1);
  if (end < node.end && last >= 0xd800 && last <= 0xdbff) end--;
  return model.text.slice(node.start, end) + (end < node.end ? '…' : '');
}
