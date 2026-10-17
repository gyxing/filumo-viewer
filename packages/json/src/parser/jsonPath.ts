import type { JsonDocument } from './types';
/** JSON Pointer 仅用于展示路径，重复键的身份仍由节点源位置决定。 */
export function jsonPath(document: JsonDocument, id: string) {
  const parts: string[] = [];
  let node = document.nodes[Number(id)];
  while (node?.parentId !== undefined) {
    const parent = document.nodes[Number(node.parentId)];
    if (parent.type === 'property')
      parts.push((parent.key ?? '').replace(/~/g, '~0').replace(/\//g, '~1'));
    else if (parent.type === 'array')
      parts.push(String(parent.childIds.indexOf(node.id)));
    node = parent;
  }
  return parts.length ? '/' + parts.reverse().join('/') : '';
}
