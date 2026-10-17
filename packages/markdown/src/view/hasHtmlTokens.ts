import type { MarkdownToken } from '../parser/types';

/** 仅真实 HTML token 触发渲染模块加载，代码中的标签始终属于代码。 */
export function hasHtmlTokens(tokens: readonly MarkdownToken[]): boolean {
  const stack = [...tokens];
  while (stack.length) {
    const token = stack.pop()!;
    if (token.type === 'html') return true;
    // 图片替代文本和代码都是文本上下文，不生成其中的 HTML 节点。
    if (['code', 'codespan', 'image'].includes(token.type)) continue;
    if (token.tokens) for (const child of token.tokens) stack.push(child);
    if (token.items) for (const child of token.items) stack.push(child);
    for (const cell of token.header ?? [])
      for (const child of cell.tokens) stack.push(child);
    for (const row of token.rows ?? [])
      for (const cell of row)
        for (const child of cell.tokens) stack.push(child);
  }
  return false;
}
