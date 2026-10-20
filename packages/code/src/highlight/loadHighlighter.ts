import type { LanguageFn } from 'highlight.js';
import type { CodeLanguage } from '../options';
import { grammarNames, highlightLanguage } from './languages';
const loaders: Record<string, () => Promise<{ default: LanguageFn }>> = {
  xml: () => import('highlight.js/lib/languages/xml'),
  javascript: () => import('highlight.js/lib/languages/javascript'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  css: () => import('highlight.js/lib/languages/css'),
  less: () => import('highlight.js/lib/languages/less'),
  scss: () => import('highlight.js/lib/languages/scss'),
  sass: () => import('./sass'),
  bash: () => import('highlight.js/lib/languages/bash'),
  python: () => import('highlight.js/lib/languages/python'),
  sql: () => import('highlight.js/lib/languages/sql'),
  java: () => import('highlight.js/lib/languages/java'),
  c: () => import('highlight.js/lib/languages/c'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  go: () => import('highlight.js/lib/languages/go'),
  rust: () => import('highlight.js/lib/languages/rust'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
  ini: () => import('highlight.js/lib/languages/ini'),
  powershell: () => import('highlight.js/lib/languages/powershell'),
  dos: () => import('highlight.js/lib/languages/dos'),
  php: () => import('highlight.js/lib/languages/php'),
  'php-template': () => import('highlight.js/lib/languages/php-template'),
  ruby: () => import('highlight.js/lib/languages/ruby'),
  kotlin: () => import('highlight.js/lib/languages/kotlin'),
  swift: () => import('highlight.js/lib/languages/swift'),
  lua: () => import('highlight.js/lib/languages/lua'),
  dockerfile: () => import('highlight.js/lib/languages/dockerfile'),
  makefile: () => import('highlight.js/lib/languages/makefile'),
  cmake: () => import('highlight.js/lib/languages/cmake'),
  graphql: () => import('highlight.js/lib/languages/graphql'),
  protobuf: () => import('highlight.js/lib/languages/protobuf'),
  diff: () => import('highlight.js/lib/languages/diff'),
  dotenv: () => import('./dotenv'),
};
/** 只在专用增强 Worker 中加载核心及指定语言。 */
export async function loadHighlighter(
  language: Exclude<CodeLanguage, 'plaintext'>,
) {
  const core = (await import('highlight.js/lib/core')).default;
  for (const name of grammarNames[language])
    if (!core.getLanguage(name))
      core.registerLanguage(name, (await loaders[name]()).default);
  return {
    highlight: (text: string) =>
      core.highlight(text, {
        language: highlightLanguage(language, text),
        ignoreIllegals: true,
      }).value,
  };
}
