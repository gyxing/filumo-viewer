type CatalogLabel = Readonly<Record<'en-US' | 'zh-CN', string>>;

export interface FormatCatalogGroup {
  id: string;
  label: CatalogLabel;
  extensions: readonly string[];
  fileNames?: readonly string[];
  patterns?: readonly string[];
}

export interface FormatCatalogEntry {
  id: string;
  label: CatalogLabel;
  groups: readonly FormatCatalogGroup[];
  note: CatalogLabel;
}

// 文档清单不导入格式包；一致性回归对照真实描述符，避免首页提前加载任何解析引擎。
export const FORMAT_CATALOG: readonly FormatCatalogEntry[] = [
  {
    id: 'archive',
    label: { 'en-US': 'Archives', 'zh-CN': '压缩包' },
    groups: [
      {
        id: 'zip',
        label: { 'en-US': 'ZIP and ZIP containers', 'zh-CN': 'ZIP 与容器文件' },
        extensions: [
          '.zip',
          '.jar',
          '.war',
          '.ear',
          '.apk',
          '.aab',
          '.cbz',
          '.kmz',
        ],
      },
      {
        id: 'tar',
        label: { 'en-US': 'TAR', 'zh-CN': 'TAR 归档' },
        extensions: ['.tar'],
      },
      {
        id: 'gzip',
        label: { 'en-US': 'GZIP and TAR.GZ', 'zh-CN': 'GZIP 与 TAR.GZ' },
        extensions: ['.gz', '.gzip', '.tgz'],
        patterns: ['*.tar.gz'],
      },
      {
        id: 'rar',
        label: { 'en-US': 'RAR', 'zh-CN': 'RAR' },
        extensions: ['.rar'],
      },
      {
        id: '7z',
        label: { 'en-US': '7-Zip', 'zh-CN': '7-Zip' },
        extensions: ['.7z'],
      },
      {
        id: 'xz',
        label: { 'en-US': 'XZ-compressed TAR', 'zh-CN': 'XZ 压缩的 TAR' },
        extensions: ['.tar.xz', '.txz'],
        patterns: ['*.tar.xz'],
      },
    ],
    note: {
      'en-US':
        'Read-only directories and on-demand previews using registered plugins. ZIP/TAR use range reads where available; GZIP is sequential. WASM formats have a bounded full-input limit. XZ requires a TAR payload with the current engine; standalone single-file XZ streams are not supported. Encrypted and multipart archives are not included.',
      'zh-CN':
        '只读浏览目录，按需交给已注册格式预览。ZIP/TAR 尽可能区间读取，GZIP 顺序解压；WASM 格式受完整输入上限约束。当前引擎的 XZ 内容必须是 TAR，暂不支持仅压缩单个文件的 XZ 流。不支持加密和分卷。',
    },
  },
  {
    id: 'office',
    label: { 'en-US': 'Office documents', 'zh-CN': 'Office 文档' },
    groups: [
      {
        id: 'word',
        label: { 'en-US': 'Word / WPS', 'zh-CN': 'Word / WPS' },
        extensions: ['.doc', '.wps', '.docx', '.docm', '.dotx'],
      },
      {
        id: 'excel',
        label: { 'en-US': 'Excel', 'zh-CN': 'Excel' },
        extensions: ['.xls', '.xlsx', '.xlsm', '.xltx'],
      },
      {
        id: 'powerpoint',
        label: { 'en-US': 'PowerPoint', 'zh-CN': 'PowerPoint' },
        extensions: ['.ppt', '.pptx', '.pptm', '.potx'],
      },
    ],
    note: {
      'en-US':
        'Documents, workbooks, presentations and supported templates are read-only. Macro-enabled files display supported content without executing macros.',
      'zh-CN':
        '只读预览文档、工作簿、演示文稿及支持的模板；宏启用文件仅展示支持的内容，不执行宏。',
    },
  },
  {
    id: 'pdf',
    label: { 'en-US': 'PDF', 'zh-CN': 'PDF' },
    groups: [
      {
        id: 'pdf',
        label: { 'en-US': 'PDF documents', 'zh-CN': 'PDF 文档' },
        extensions: ['.pdf'],
      },
    ],
    note: {
      'en-US':
        'Continuous reading with outlines, thumbnails and text search. Scanned pages do not gain searchable text without OCR.',
      'zh-CN':
        '连续阅读、大纲、缩略图与文字查找；不提供 OCR，纯扫描页不会自动生成可搜索文字。',
    },
  },
  {
    id: 'image',
    label: { 'en-US': 'Images', 'zh-CN': '图片' },
    groups: [
      {
        id: 'images',
        label: { 'en-US': 'Image files', 'zh-CN': '图片文件' },
        extensions: [
          '.png',
          '.jpg',
          '.jpeg',
          '.gif',
          '.webp',
          '.bmp',
          '.svg',
          '.avif',
        ],
      },
    ],
    note: {
      'en-US':
        'Rendering depends on the browser decoder, including AVIF. SVG is displayed in an image context; arbitrary XML is not treated as an image.',
      'zh-CN':
        '能否呈现取决于浏览器解码能力，AVIF 也受此限制。SVG 以图片上下文展示，不把任意 XML 当作图片。',
    },
  },
  {
    id: 'text',
    label: { 'en-US': 'Plain text', 'zh-CN': '纯文本' },
    groups: [
      {
        id: 'text',
        label: { 'en-US': 'Text and logs', 'zh-CN': '文本与日志' },
        extensions: [
          '.txt',
          '.log',
          '.ini',
          '.conf',
          '.cfg',
          '.properties',
          '.out',
        ],
      },
    ],
    note: {
      'en-US':
        'Other unknown or extensionless files can use optional text fallback only after readability checks. Binary content and dedicated-format parse failures do not become plain text.',
      'zh-CN':
        '其他未知后缀或无后缀文件仅在可读性检查通过后尝试可选的文本兜底；二进制内容及专用格式解析失败不转为纯文本。',
    },
  },
  {
    id: 'json',
    label: { 'en-US': 'JSON', 'zh-CN': 'JSON' },
    groups: [
      {
        id: 'json',
        label: { 'en-US': 'JSON variants', 'zh-CN': 'JSON 及变体' },
        extensions: ['.json', '.jsonc', '.jsonl', '.ndjson'],
      },
    ],
    note: {
      'en-US':
        'JSONC supports comments and trailing commas; JSONL and NDJSON validate records independently. JSON5 is not supported.',
      'zh-CN':
        'JSONC 支持注释及尾逗号；JSONL、NDJSON 按记录独立校验。不支持 JSON5。',
    },
  },
  {
    id: 'markdown',
    label: { 'en-US': 'Markdown', 'zh-CN': 'Markdown' },
    groups: [
      {
        id: 'markdown',
        label: { 'en-US': 'Markdown files', 'zh-CN': 'Markdown 文件' },
        extensions: ['.md', '.markdown'],
      },
    ],
    note: {
      'en-US':
        'GFM and controlled HTML are rendered in reading mode. Scripts, global styles, arbitrary embedded pages, formulas and Mermaid are not executed or rendered.',
      'zh-CN':
        '阅读模式呈现 GFM 与受控 HTML，不执行脚本、不应用全局样式、不嵌入任意页面；不提供公式或 Mermaid 渲染。',
    },
  },
  {
    id: 'csv',
    label: { 'en-US': 'CSV / TSV', 'zh-CN': 'CSV / TSV' },
    groups: [
      {
        id: 'delimited',
        label: { 'en-US': 'Delimited tables', 'zh-CN': '分隔符表格' },
        extensions: ['.csv', '.tsv'],
      },
    ],
    note: {
      'en-US':
        'Read-only table previews preserve fields as strings, support separators and selection copying, and never execute formulas.',
      'zh-CN': '只读表格保留字段字符串，支持分隔符切换与选区复制，不执行公式。',
    },
  },
  {
    id: 'xml',
    label: { 'en-US': 'XML', 'zh-CN': 'XML' },
    groups: [
      {
        id: 'xml',
        label: { 'en-US': 'XML documents', 'zh-CN': 'XML 文档' },
        extensions: ['.xml'],
      },
    ],
    note: {
      'en-US':
        'Source and structure views preserve namespaces and attributes. DTD declarations are rejected; SVG belongs to the image plugin.',
      'zh-CN':
        '原文与结构视图保留命名空间和属性，拒绝 DTD 声明；SVG 归图片插件处理。',
    },
  },
  {
    id: 'code',
    label: { 'en-US': 'Code and development files', 'zh-CN': '代码与开发文件' },
    groups: [
      {
        id: 'web',
        label: {
          'en-US': 'JavaScript, TypeScript and HTML',
          'zh-CN': 'JavaScript、TypeScript 与 HTML',
        },
        extensions: [
          '.js',
          '.mjs',
          '.cjs',
          '.jsx',
          '.ts',
          '.mts',
          '.cts',
          '.tsx',
          '.html',
          '.htm',
        ],
      },
      {
        id: 'styles',
        label: { 'en-US': 'Stylesheets', 'zh-CN': '样式文件' },
        extensions: ['.css', '.less', '.scss', '.sass'],
      },
      {
        id: 'scripts',
        label: {
          'en-US': 'Shell, PowerShell and Batch',
          'zh-CN': 'Shell、PowerShell 与批处理',
        },
        extensions: [
          '.sh',
          '.bash',
          '.zsh',
          '.ps1',
          '.psm1',
          '.psd1',
          '.bat',
          '.cmd',
        ],
      },
      {
        id: 'languages',
        label: {
          'en-US': 'Other programming languages',
          'zh-CN': '其他常用编程语言',
        },
        extensions: [
          '.py',
          '.pyw',
          '.sql',
          '.java',
          '.c',
          '.h',
          '.cpp',
          '.cc',
          '.cxx',
          '.hpp',
          '.hh',
          '.hxx',
          '.cs',
          '.go',
          '.rs',
          '.php',
          '.rb',
          '.rake',
          '.kt',
          '.kts',
          '.swift',
          '.lua',
        ],
      },
      {
        id: 'config',
        label: {
          'en-US': 'Configuration and environment',
          'zh-CN': '配置与环境文件',
        },
        extensions: ['.yaml', '.yml', '.toml', '.env'],
        fileNames: ['.env'],
        patterns: ['.env.*'],
      },
      {
        id: 'build',
        label: {
          'en-US': 'Build, protocols and patches',
          'zh-CN': '构建、协议与补丁',
        },
        extensions: [
          '.dockerfile',
          '.mk',
          '.cmake',
          '.graphql',
          '.gql',
          '.proto',
          '.diff',
          '.patch',
        ],
        fileNames: ['Dockerfile', 'Makefile', 'GNUmakefile', 'CMakeLists.txt'],
        patterns: ['Dockerfile.*'],
      },
    ],
    note: {
      'en-US':
        'Source is the default. HTML/HTM can switch to controlled static reading; scripts and external stylesheets do not execute or affect the host. Dedicated formats such as JSON and XML retain priority. Vue/Svelte mixed syntax is not included.',
      'zh-CN':
        '默认源码；HTML/HTM 可切换受控静态阅读，不执行脚本或将外链样式应用到宿主。JSON、XML 等专用后缀保持优先，暂不包括 Vue/Svelte 混合语法。',
    },
  },
];
