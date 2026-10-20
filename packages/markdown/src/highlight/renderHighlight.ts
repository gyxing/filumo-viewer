import {
  highlightToDecorations,
  renderHighlightedText,
} from '@fivo/dom/text-highlight';

/** 高亮仅增强样式；公共转换校验原文，禁止任意 HTML 注入。 */
export function renderHighlight(
  document: Document,
  html: string,
  source?: string,
) {
  const Parser = document.defaultView?.DOMParser;
  const text =
    source ??
    (Parser
      ? new Parser().parseFromString(html, 'text/html').body.textContent ?? ''
      : '');
  const ranges = highlightToDecorations(text, html);
  return ranges
    ? renderHighlightedText(document, text, ranges)
    : document.createTextNode(text);
}
