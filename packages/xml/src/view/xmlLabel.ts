import type { XmlNode } from '../parser/types';
import { xmlNodeParts } from './xmlRows';

/** 只创建文本片段，不把 XML 内容作为 HTML 插入结构树。 */
export function renderXmlLabel(node: XmlNode, document: Document): HTMLElement {
  const label = document.createElement('span');
  label.className = 'filumo-xml-node-label';
  for (const part of xmlNodeParts(node)) {
    const segment = document.createElement('span');
    segment.className = 'filumo-xml-node-' + part.kind;
    segment.textContent = part.text;
    label.append(segment);
  }
  return label;
}
