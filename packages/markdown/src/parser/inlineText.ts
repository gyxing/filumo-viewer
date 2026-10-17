import type { MarkdownToken } from './types';

/** 提取标题和图片说明的可读文字；代码与转义字符保持字面含义。 */
export function markdownInlineText(
  tokens: readonly MarkdownToken[],
  decode: (value: string) => string = (value) => value,
): string {
  return tokens
    .map((token) => {
      if (token.type === 'codespan' || token.type === 'escape')
        return token.text ?? '';
      if (token.type === 'br') return ' ';
      if (token.type === 'checkbox') return '';
      if (token.type === 'html') return token.raw ?? token.text ?? '';
      if (token.tokens) return markdownInlineText(token.tokens, decode);
      return decode(token.text ?? '');
    })
    .join('');
}
