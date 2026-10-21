import { throwIfAborted } from '@filumo/core';
import { buildOutline } from './buildOutline';
import type { MarkdownDocument, MarkdownToken } from './types';

/** 首次阅读时才载入词法器，每次使用独立实例，不改全局配置。 */
export async function parseMarkdown(
  text: string,
  signal: AbortSignal,
): Promise<MarkdownDocument> {
  throwIfAborted(signal);
  const { Marked } = await import('marked');
  throwIfAborted(signal);
  const lexer = new Marked({ gfm: true });
  // Token 只包含结构化数据；第三方对象不暴露到工厂或跨格式共享模型。
  const tokens = lexer.lexer(text) as unknown as MarkdownToken[];
  throwIfAborted(signal);
  return { text, tokens, headings: buildOutline(tokens) };
}
