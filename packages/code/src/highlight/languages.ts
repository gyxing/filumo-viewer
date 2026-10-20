import type { CodeLanguage } from '../options';
/** HTML 内嵌脚本和 JSX 标记只加载其必需的关联语法。 */
export const grammarNames: Record<
  Exclude<CodeLanguage, 'plaintext'>,
  string[]
> = {
  javascript: ['xml', 'javascript'],
  typescript: ['xml', 'typescript'],
  html: ['xml', 'javascript', 'css'],
  css: ['css'],
  less: ['less'],
  scss: ['scss'],
  sass: ['sass'],
  bash: ['bash'],
  python: ['python'],
  sql: ['sql'],
  java: ['java'],
  c: ['c'],
  cpp: ['cpp'],
  csharp: ['csharp'],
  go: ['go'],
  rust: ['rust'],
  // YAML 和 Dockerfile 的内嵌区域由上游语法声明对应依赖。
  yaml: ['ruby', 'yaml'],
  toml: ['ini'],
  powershell: ['powershell'],
  batch: ['dos'],
  php: ['xml', 'javascript', 'css', 'php', 'php-template'],
  ruby: ['ruby'],
  kotlin: ['kotlin'],
  swift: ['swift'],
  lua: ['lua'],
  dockerfile: ['bash', 'dockerfile'],
  makefile: ['makefile'],
  cmake: ['cmake'],
  graphql: ['graphql'],
  protobuf: ['protobuf'],
  diff: ['diff'],
  dotenv: ['dotenv'],
};

/** 对外语言名与上游模块身份分开，PHP 文件中的标签区域使用模板语法。 */
export function highlightLanguage(
  language: Exclude<CodeLanguage, 'plaintext'>,
  source: string,
): string {
  if (language === 'html') return 'xml';
  if (language === 'toml') return 'ini';
  if (language === 'batch') return 'dos';
  if (language === 'php' && /<\?(?!xml\b)/i.test(source)) return 'php-template';
  return language;
}
