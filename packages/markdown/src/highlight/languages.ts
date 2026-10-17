import type { LanguageFn } from 'highlight.js';
// 仅保留实际支持语法的加载函数，禁止 common/all 或全文自动探测。
export const languages: Record<string, () => Promise<{ default: LanguageFn }>> =
  {
    javascript: () => import('highlight.js/lib/languages/javascript'),
    typescript: () => import('highlight.js/lib/languages/typescript'),
    json: () => import('highlight.js/lib/languages/json'),
    xml: () => import('highlight.js/lib/languages/xml'),
    css: () => import('highlight.js/lib/languages/css'),
    bash: () => import('highlight.js/lib/languages/bash'),
    python: () => import('highlight.js/lib/languages/python'),
    sql: () => import('highlight.js/lib/languages/sql'),
  };
const aliases: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  html: 'xml',
  svg: 'xml',
  sh: 'bash',
  shell: 'bash',
  py: 'python',
};
/** 未知语言保持原文，不能因为猜测语言而加载所有语法。 */
export function normalizeLanguage(name: string) {
  const value = name.trim().split(/\s/)[0].toLowerCase(),
    canonical = aliases[value] ?? value;
  return Object.prototype.hasOwnProperty.call(languages, canonical)
    ? canonical
    : undefined;
}
