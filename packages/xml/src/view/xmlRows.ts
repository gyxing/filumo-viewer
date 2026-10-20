import type { XmlDocument, XmlNode } from '../parser/types';
/** 结构模型保持 XML 身份，公共树只消费真实节点引用和文本标签。 */
export function xmlChildren(
  model: XmlDocument,
  node: XmlNode,
  whitespace: boolean,
): XmlNode[] {
  return node.childIds
    .map((id) => model.nodes[Number(id)])
    .filter((child) => whitespace || !child.whitespace);
}
export interface XmlLabelPart {
  kind: 'name' | 'value' | 'punctuation' | 'marker' | 'comment';
  text: string;
}

/** 片段只表达 XML 节点身份，属性和正文不依据内容猜测数字或布尔类型。 */
export function xmlNodeParts(node: XmlNode): readonly XmlLabelPart[] {
  const punctuation = (text: string): XmlLabelPart => ({
    kind: 'punctuation',
    text,
  });
  let value = (node.value ?? '').replace(/\s+/g, ' ');
  // 解析摘要可能恰好截断代理对，省略时避免显示孤立的高位代理字符。
  if (node.truncated && /[\ud800-\udbff]$/.test(value))
    value = value.slice(0, -1);
  if (node.truncated) value += '…';
  if (node.kind === 'element')
    return [
      punctuation('<'),
      { kind: 'name', text: node.name ?? '' },
      punctuation('>'),
    ];
  if (node.kind === 'attribute' || node.kind === 'namespace') {
    const parts: XmlLabelPart[] =
      node.kind === 'attribute' ? [{ kind: 'marker', text: '@' }] : [];
    return [
      ...parts,
      { kind: 'name', text: node.name ?? '' },
      punctuation(' = "'),
      { kind: 'value', text: value },
      punctuation('"'),
    ];
  }
  if (node.kind === 'comment')
    return [
      punctuation('<!-- '),
      { kind: 'comment', text: value },
      punctuation(' -->'),
    ];
  if (node.kind === 'cdata')
    return [
      punctuation('<![CDATA['),
      { kind: 'value', text: value },
      punctuation(']]>'),
    ];
  if (node.kind === 'processing') {
    const split = value.search(/\s/),
      name = split < 0 ? value : value.slice(0, split),
      data = split < 0 ? '' : value.slice(split);
    return [
      punctuation('<?'),
      { kind: 'name', text: name },
      { kind: 'value', text: data },
      punctuation('?>'),
    ];
  }
  if (node.kind === 'document') return [{ kind: 'marker', text: '#document' }];
  return [
    { kind: 'marker', text: '#text: ' },
    { kind: 'value', text: value },
  ];
}

/** 可访问名称与富标签共用同一摘要，完整源内容仍通过节点范围定位。 */
export function xmlNodeLabel(node: XmlNode): string {
  return xmlNodeParts(node)
    .map((part) => part.text)
    .join('');
}
