/** 高亮库的输出只转为文本及 span 类；不把文档 HTML 或任意属性带入活跃 DOM。 */
export function renderHighlight(document: Document, html: string) {
  const Parser = document.defaultView?.DOMParser;
  if (!Parser) return document.createTextNode('');
  const parsed = new Parser().parseFromString(html, 'text/html');
  const fragment = document.createDocumentFragment();
  const append = (source: Node, parent: Node) => {
    if (source.nodeType === 3) {
      parent.appendChild(document.createTextNode(source.textContent ?? ''));
      return;
    }
    if (source.nodeType !== 1) return;
    const element = source as Element;
    if (element.tagName !== 'SPAN') {
      parent.appendChild(document.createTextNode(element.textContent ?? ''));
      return;
    }
    const target = document.createElement('span');
    target.className = Array.from(element.classList)
      .filter((name) => /^(?:hljs-[\w-]+|[\w-]+_)$/.test(name))
      .join(' ');
    for (const child of Array.from(element.childNodes)) append(child, target);
    parent.appendChild(target);
  };
  for (const child of Array.from(parsed.body.childNodes))
    append(child, fragment);
  return fragment;
}
