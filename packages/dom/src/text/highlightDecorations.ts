import type { TextDecoration } from './types';

/** 只接受高亮器生成的 span/text 子集，逐段校验原文，Worker 无需 DOM 解析器。 */
export function highlightToDecorations(
  source: string,
  html: string,
  maxRanges = 100000,
): readonly TextDecoration[] | undefined {
  const stack: string[][] = [],
    ranges: TextDecoration[] = [];
  let at = 0,
    offset = 0;
  while (at < html.length) {
    if (html[at] === '<') {
      if (html.startsWith('</span>', at)) {
        if (!stack.length) return undefined;
        stack.pop();
        at += 7;
        continue;
      }
      const tag = /^<span(?: class="([\w\s-]*)")?>/.exec(html.slice(at));
      if (!tag) return undefined;
      stack.push(
        (tag[1] ?? '')
          .split(/\s+/)
          .filter((name) => /^(?:hljs-[\w-]+|[\w-]+_)$/.test(name)),
      );
      at += tag[0].length;
      continue;
    }
    let text: string;
    if (html[at] === '&') {
      const entity = /^&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/i.exec(
        html.slice(at),
      );
      if (!entity) return undefined;
      const key = entity[0].slice(1, -1),
        named: Record<string, string> = {
          amp: '&',
          lt: '<',
          gt: '>',
          quot: '"',
          apos: "'",
        };
      if (key.startsWith('#')) {
        const n =
          key[1].toLowerCase() === 'x'
            ? parseInt(key.slice(2), 16)
            : Number(key.slice(1));
        if (
          !Number.isSafeInteger(n) ||
          n < 0 ||
          n > 0x10ffff ||
          (n >= 0xd800 && n <= 0xdfff)
        )
          return undefined;
        text = String.fromCodePoint(n);
      } else text = named[key.toLowerCase()];
      at += entity[0].length;
    } else {
      const end = html.slice(at).search(/[<&]/);
      const finish = end < 0 ? html.length : at + end;
      text = html.slice(at, finish);
      at = finish;
    }
    if (!source.startsWith(text, offset)) return undefined;
    const className = [...new Set(stack.flat())].join(' '),
      end = offset + text.length;
    if (className && text) {
      const last = ranges[ranges.length - 1];
      if (last?.className === className && last.end === offset) last.end = end;
      else {
        if (ranges.length >= maxRanges) return undefined;
        ranges.push({ start: offset, end, className });
      }
    }
    offset = end;
  }
  return !stack.length && offset === source.length ? ranges : undefined;
}

/** 装饰只创建文本与 span，不把高亮 HTML 写入活跃文档。 */
export function renderHighlightedText(
  document: Document,
  source: string,
  decorations: readonly TextDecoration[],
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  let offset = 0;
  for (const range of decorations) {
    if (
      !Number.isSafeInteger(range.start) ||
      !Number.isSafeInteger(range.end) ||
      range.start < offset ||
      range.end <= range.start ||
      range.end > source.length
    ) {
      fragment.replaceChildren(document.createTextNode(source));
      return fragment;
    }
    fragment.append(document.createTextNode(source.slice(offset, range.start)));
    const span = document.createElement('span');
    span.className = range.className
      .split(/\s+/)
      .filter((name) => /^(?:hljs-[\w-]+|[\w-]+_)$/.test(name))
      .join(' ');
    span.textContent = source.slice(range.start, range.end);
    fragment.append(span);
    offset = range.end;
  }
  fragment.append(document.createTextNode(source.slice(offset)));
  return fragment;
}
