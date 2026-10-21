import { throwIfAborted } from '@filumo/core';
import type { TextDecoration } from '@filumo/dom/text';
import type { CodeLanguage } from '../options';
export type CodeHighlightResult =
  | { kind: 'ready'; decorations: readonly TextDecoration[] }
  | {
      kind: 'plain';
      reason:
        | 'disabled'
        | 'unknown-language'
        | 'unavailable'
        | 'limit'
        | 'timeout'
        | 'error';
    };
export interface HighlightPayload {
  text: string;
  language: CodeLanguage;
  maxChars: number;
  maxRanges: number;
}
/** 高亮结果先验证为原文装饰，禁止把引擎生成的 HTML 交给页面执行。 */
export async function highlightTask(
  data: HighlightPayload,
  signal: AbortSignal,
): Promise<CodeHighlightResult> {
  throwIfAborted(signal);
  if (
    !data ||
    typeof data.text !== 'string' ||
    !Number.isSafeInteger(data.maxChars) ||
    data.maxChars <= 0 ||
    !Number.isSafeInteger(data.maxRanges) ||
    data.maxRanges <= 0
  )
    throw new Error('代码高亮任务无效');
  if (data.text.length > data.maxChars)
    return { kind: 'plain', reason: 'limit' };
  const { grammarNames } = await import('./languages');
  if (
    data.language === 'plaintext' ||
    !Object.hasOwn(grammarNames, data.language)
  )
    return { kind: 'plain', reason: 'unknown-language' };
  const highlighter = await (
    await import('./loadHighlighter')
  ).loadHighlighter(data.language);
  throwIfAborted(signal);
  const html = highlighter.highlight(data.text);
  const { highlightToDecorations } = await import('@filumo/dom/text-highlight');
  throwIfAborted(signal);
  const decorations = highlightToDecorations(data.text, html, data.maxRanges);
  return decorations
    ? { kind: 'ready', decorations }
    : { kind: 'plain', reason: 'limit' };
}
