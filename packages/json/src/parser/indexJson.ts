import type { JsonDocument, JsonNode } from './types';
/** 在有序子节点范围中定位，查找不需要遍历整棵树。 */
export function findJsonNodeAt(
  document: JsonDocument,
  offset: number,
): JsonNode {
  let node = document.nodes[Number(document.rootId)];
  while (node.childIds.length) {
    let low = 0,
      high = node.childIds.length;
    while (low + 1 < high) {
      const mid = (low + high) >>> 1;
      if (document.nodes[Number(node.childIds[mid])].start <= offset) low = mid;
      else high = mid;
    }
    const child = document.nodes[Number(node.childIds[low])];
    if (offset < child.start || offset >= child.end) break;
    node = child;
  }
  return node;
}
