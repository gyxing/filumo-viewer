import type { MarkdownHeading, MarkdownToken } from './types';
import { markdownInlineText } from './inlineText';
/** 标题与锚点共用同一编号，重复标题增加后缀但保持原文顺序。 */
export function buildOutline(
  tokens: MarkdownToken[],
  decode: (value: string) => string = (value) => value,
) {
  const headings: MarkdownHeading[] = [],
    names = new Map<string, number>(),
    used = new Set<string>();
  const visit = (items: MarkdownToken[]) => {
    for (const token of items) {
      if (token.type === 'heading') {
        const title = (
            token.tokens
              ? markdownInlineText(token.tokens, decode)
              : decode(token.text ?? '')
          ).replace(/\s+/g, ' ').trim(),
          base =
            title
              .toLowerCase()
              .replace(/[^\p{L}\p{N}_-]+/gu, '-')
              .replace(/^-|-$/g, '') || 'heading';
        let count = names.get(base) ?? 0,
          id = base + (count ? '-' + count : '');
        while (used.has(id)) {
          count++;
          id = base + '-' + count;
        }
        names.set(base, count + 1);
        used.add(id);
        token.headingId = id;
        headings.push({ id: token.headingId, title, depth: token.depth ?? 1 });
      }
      if (token.tokens) visit(token.tokens);
      if (token.items) visit(token.items);
    }
  };
  visit(tokens);
  return headings;
}
