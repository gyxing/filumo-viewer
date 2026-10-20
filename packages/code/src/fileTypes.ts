import type { CodeLanguage } from './options';
/** 明确的源码后缀才接管，通用 INI/CONF/CFG/Properties 继续由 Text 处理。 */
export const codeExtensions: Readonly<Record<string, CodeLanguage>> = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'typescript',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.less': 'less',
  '.scss': 'scss',
  '.sass': 'sass',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.py': 'python',
  '.pyw': 'python',
  '.sql': 'sql',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hh': 'cpp',
  '.hxx': 'cpp',
  '.cs': 'csharp',
  '.go': 'go',
  '.rs': 'rust',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.ps1': 'powershell',
  '.psm1': 'powershell',
  '.psd1': 'powershell',
  '.bat': 'batch',
  '.cmd': 'batch',
  '.php': 'php',
  '.rb': 'ruby',
  '.rake': 'ruby',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.swift': 'swift',
  '.lua': 'lua',
  '.dockerfile': 'dockerfile',
  '.mk': 'makefile',
  '.cmake': 'cmake',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.proto': 'protobuf',
  '.diff': 'diff',
  '.patch': 'diff',
  '.env': 'dotenv',
};
// 完整文件名规则解决无后缀构建文件，以及 CMakeLists.txt 的专用身份。
const codeFileNames: Readonly<Record<string, CodeLanguage>> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  gnumakefile: 'makefile',
  'cmakelists.txt': 'cmake',
  '.env': 'dotenv',
};
// 文件名变体不能绕过已明确的文档/结构格式，避免 Dockerfile.xml 被当作构建脚本。
const dedicatedExtensions = new Set([
  '.json',
  '.jsonc',
  '.jsonl',
  '.ndjson',
  '.json5',
  '.xml',
  '.svg',
  '.csv',
  '.tsv',
  '.md',
  '.markdown',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.wps',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.avif',
]);
/** 工具栏使用完整语言名，语言标识仍与高亮任务保持一致。 */
export const codeLanguages: Readonly<Record<CodeLanguage, string>> = {
  javascript: 'JavaScript / JSX',
  typescript: 'TypeScript / TSX',
  html: 'HTML',
  css: 'CSS',
  less: 'LESS',
  scss: 'SCSS',
  sass: 'Sass',
  bash: 'Shell',
  python: 'Python',
  sql: 'SQL',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  go: 'Go',
  rust: 'Rust',
  yaml: 'YAML',
  toml: 'TOML',
  powershell: 'PowerShell',
  batch: 'Batch / CMD',
  php: 'PHP',
  ruby: 'Ruby',
  kotlin: 'Kotlin',
  swift: 'Swift',
  lua: 'Lua',
  dockerfile: 'Dockerfile',
  makefile: 'Makefile',
  cmake: 'CMake',
  graphql: 'GraphQL',
  protobuf: 'Protocol Buffers',
  diff: 'Diff / Patch',
  dotenv: '.env',
  plaintext: '纯文本',
};
/** 描述符与打开阶段共用文件身份规则，识别不读取正文或加载语法模块。 */
export function detectCodeLanguage(name?: string): CodeLanguage | undefined {
  const basename = name?.split(/[\\/]/).at(-1)?.toLowerCase();
  if (!basename) return undefined;
  if (Object.hasOwn(codeFileNames, basename)) return codeFileNames[basename];
  const extension = basename.match(/\.[^.]+$/)?.[0] ?? '';
  if (dedicatedExtensions.has(extension)) return undefined;
  if (/^dockerfile\..+$/.test(basename)) return 'dockerfile';
  if (/^\.env\..+$/.test(basename)) return 'dotenv';
  return codeExtensions[extension];
}

/** 显式选择 Code 打开未知文件时保留纯文本，手动指定语言优先于默认值。 */
export function codeLanguageForName(name?: string): CodeLanguage {
  return detectCodeLanguage(name) ?? 'plaintext';
}
