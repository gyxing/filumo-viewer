import type { MarkdownHeading } from '../parser/types';

/** 读取真实呈现文字，图片使用替代文本，资源状态和控件不进入大纲标题。 */
function readableText(root: Node): string {
  let text = '';
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.nodeType === 3) {
      text += node.textContent ?? '';
      continue;
    }
    if (node.nodeType !== 1) continue;
    const element = node as HTMLElement;
    if (element.hasAttribute('data-search-exclude') || element.tagName === 'BUTTON')
      continue;
    if (element.tagName === 'IMG') {
      text += (element as HTMLImageElement).alt;
      continue;
    }
    if (element.tagName === 'BR') {
      text += ' ';
      continue;
    }
    for (let index = node.childNodes.length - 1; index >= 0; index--)
      stack.push(node.childNodes[index]);
  }
  return text.replace(/\s+/g, ' ').trim();
}

/** Markdown 与 HTML 在同一次扫描中分配唯一锚点，保持正文顺序及实例隔离。 */
export function collectHtmlNavigation(
  article: HTMLElement,
  prefix: string,
  sourceIds: ReadonlyMap<HTMLElement, readonly string[]>,
) {
  const headings: MarkdownHeading[] = [],
    headingNodes = new Map<string, HTMLElement>(),
    targets = new Map<string, HTMLElement>(),
    used = new Set<string>(),
    counts = new Map<string, number>();
  for (const element of article.querySelectorAll<HTMLElement>('[id],h1,h2,h3,h4,h5,h6')) {
    const heading = /^H[1-6]$/.test(element.tagName),
      title = heading ? readableText(element) : '',
      aliases = sourceIds.get(element) ?? [];
    const base = aliases[0] || (heading
      ? title.toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '') || 'heading'
      : element.id.slice(prefix.length));
    if (!base) continue;
    let count = counts.get(base) ?? 0,
      id = base + (count ? '-' + count : '');
    while (used.has(id)) id = base + '-' + ++count;
    counts.set(base, count + 1);
    used.add(id);
    element.id = prefix + id;
    targets.set(id, element);
    for (const alias of aliases)
      if (!targets.has(alias)) targets.set(alias, element);
    if (heading && title) {
      headings.push({ id, title, depth: Number(element.tagName.slice(1)) });
      headingNodes.set(id, element);
    }
  }
  return { headings, headingNodes, targets };
}
