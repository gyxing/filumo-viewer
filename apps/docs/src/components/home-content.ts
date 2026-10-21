import { DOCS_BASE } from '../site-path';
export type WebsiteLocale = 'en-US' | 'zh-CN';
export type PackageManager = 'npm' | 'yarn';

export const SITE_ROOT = DOCS_BASE;
export const GITHUB_URL = 'https://github.com/gyxing/office-file-viewer';
export const NPM_URL = 'https://www.npmjs.com/org/filumo';

type ProductFactContent = {
  value: string;
  label: string;
};

type ProductOverviewItemContent = {
  index: string;
  title: string;
  description: string;
};

type FlowStepContent = {
  index: string;
  title: string;
  description: string;
};

type HighlightContent = {
  label: string;
  title: string;
  description: string;
  tone: 'primary' | 'cyan' | 'violet' | 'neutral';
};

type FormatGroupContent = {
  category: string;
  title: string;
  formats: string[];
  description: string;
  capabilities: string[];
  tone: 'document' | 'spreadsheet' | 'presentation';
};

type CompatibilityContent = {
  name: string;
  version: string;
  note: string;
};

export type WebsiteContent = {
  htmlLang: WebsiteLocale;
  languageLabel: string;
  languageHref: string;
  /** 当前语言的完整文档入口。 */
  docsHref: string;
  /** 当前语言的独立在线体验入口。 */
  playgroundHref: string;
  skipToContent: string;
  navigation: {
    ariaLabel: string;
    /** 完整文档入口使用的本地化文案。 */
    docs: string;
    overview: string;
    demo: string;
    highlights: string;
    formats: string;
    github: string;
    npm: string;
  };
  documentation: {
    /** 桌面目录卡片使用的标题。 */
    tocTitle: string;
    /** 移动端打开目录的操作文案。 */
    openToc: string;
    /** 移动端关闭目录的无障碍文案。 */
    closeToc: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    primaryAction: string;
    secondaryAction: string;
    privacy: string;
    copy: string;
    copied: string;
    copyFailed: string;
  };
  productFlow: {
    title: string;
    status: string;
    fileName: string;
    fileMeta: string;
    stages: FlowStepContent[];
    privacyTitle: string;
    privacyDescription: string;
  };
  overview: {
    eyebrow: string;
    title: string;
    description: string;
    details: string;
    capabilities: ProductOverviewItemContent[];
    useCasesLabel: string;
    useCases: string[];
    facts: ProductFactContent[];
    architecture: {
      /** 当前语言对应的架构图静态资源地址。 */
      imageSrc: string;
      /** 架构图的无障碍替代文本。 */
      imageAlt: string;
    };
  };
  demo: {
    eyebrow: string;
    title: string;
    description: string;
    privacyTitle: string;
    privacyDescription: string;
    action: string;
  };
  highlights: {
    eyebrow: string;
    title: string;
    description: string;
    items: HighlightContent[];
  };
  formats: {
    eyebrow: string;
    title: string;
    description: string;
    groups: FormatGroupContent[];
    roadmapTitle: string;
    roadmapDescription: string;
  };
  developer: {
    eyebrow: string;
    title: string;
    description: string;
    installLabel: string;
    exampleLabel: string;
    packageManagerLabel: string;
    commands: Record<PackageManager, string>;
    example: string;
    copy: string;
    copied: string;
    copyFailed: string;
    github: string;
    npm: string;
  };
  compatibility: {
    eyebrow: string;
    title: string;
    description: string;
    items: CompatibilityContent[];
  };
  finalCta: {
    title: string;
    description: string;
    demo: string;
    github: string;
  };
  footer: {
    description: string;
    license: string;
    builtWith: string;
  };
};

// 中英文内容共用完全一致的数据结构，避免语言页面在功能区块上产生差异。
const WEBSITE_CONTENT: Record<WebsiteLocale, WebsiteContent> = {
  'en-US': {
    htmlLang: 'en-US',
    languageLabel: '简体中文',
    languageHref: `${SITE_ROOT}zh-CN/`,
    docsHref: `${SITE_ROOT}docs`,
    playgroundHref: `${SITE_ROOT}playground`,
    skipToContent: 'Skip to main content',
    navigation: {
      ariaLabel: 'Primary navigation',
      docs: 'Docs',
      overview: 'Product',
      demo: 'Live demo',
      highlights: 'Highlights',
      formats: 'Formats',
      github: 'GitHub',
      npm: 'npm',
    },
    documentation: {
      tocTitle: 'Documentation',
      openToc: 'Documentation',
      closeToc: 'Close table of contents',
    },
    hero: {
      eyebrow: 'Filumo 0.1.0 · Open-source file viewer',
      title: 'Preview files in your browser.',
      description:
        'Preview Office, PDF, images, text and structured files through one browser viewer, with adapters for React, Vue 3, Vue 2 and native JavaScript.',
      primaryAction: 'Try a local file',
      secondaryAction: 'View on GitHub',
      privacy: 'No upload. No conversion server. Your file stays in this tab.',
      copy: 'Copy',
      copied: 'Copied',
      copyFailed: 'Copy manually',
    },
    productFlow: {
      title: 'Local preview pipeline',
      status: 'Browser only',
      fileName: 'Your file',
      fileMeta: 'File API · local source',
      stages: [
        {
          index: '01',
          title: 'Select',
          description: 'Choose a file from this device.',
        },
        {
          index: '02',
          title: 'Parse',
          description: 'The selected format engine loads on demand.',
        },
        {
          index: '03',
          title: 'Render',
          description: 'The shared DOM viewer presents the content.',
        },
      ],
      privacyTitle: 'The file remains local',
      privacyDescription:
        'The demo does not send the selected document to an upload service.',
    },
    overview: {
      eyebrow: 'Product',
      title: 'One viewer, nine format plugins.',
      description:
        'Filumo is a browser-side file viewer with independent format plugins and thin framework adapters. Local files do not require an upload or conversion service.',
      details:
        'Use it in attachment previews, knowledge bases and developer tools. Install only the format packages you need, or choose the standard preset.',
      capabilities: [
        {
          index: '01',
          title: 'Accept the source you already have',
          description:
            'Pass a File, Blob, Uint8Array, URL or DocumentSource factory through the same source contract.',
        },
        {
          index: '02',
          title: 'Manage the preview lifecycle',
          description:
            'Format detection, parsing progress, cancellation, errors, and resource cleanup stay within one component boundary.',
        },
        {
          index: '03',
          title: 'Adapt the interface to the file',
          description:
            'The shared shell adapts navigation, source views, outlines, structure trees and search to each format.',
        },
      ],
      useCasesLabel: 'Typical use cases',
      useCases: [
        'Document management',
        'Knowledge bases',
        'Business attachments',
        'Privacy-sensitive tools',
      ],
      facts: [
        { value: '0.1.0', label: 'current workspace version' },
        { value: '9', label: 'format plugins' },
        { value: '15', label: 'packages in the workspace' },
      ],
      architecture: {
        imageSrc: `${SITE_ROOT}assets/filumo-architecture-flow.en-us.svg`,
        imageAlt:
          'Filumo architecture: source and session protocols, shared DOM shell, nine lazy format plugins and framework adapters.',
      },
    },
    demo: {
      eyebrow: 'Live demo',
      title: 'Open a file from your device.',
      description:
        'Open Office, PDF, images, text, JSON, Markdown, CSV, XML or code. The file stays in this browser tab.',
      privacyTitle: 'Private by default',
      privacyDescription:
        'This page does not upload the file you select to a server.',
      action: 'Open the playground',
    },
    highlights: {
      eyebrow: 'Why Filumo',
      title: 'Useful capabilities for real product interfaces.',
      description:
        'One integration for file viewing, with format-specific controls and explicit resource and lifecycle boundaries.',
      items: [
        {
          label: 'Privacy',
          title: 'Browser-side by architecture',
          description:
            'Local files are read, parsed, and rendered in the browser, so a companion upload or conversion service is not required.',
          tone: 'primary',
        },
        {
          label: 'Performance',
          title: 'Responsive parsing for larger files',
          description:
            'Lazy format engines, windowed text and trees, and budgeted PDF canvases reduce unnecessary work. Actual performance depends on the file and browser.',
          tone: 'cyan',
        },
        {
          label: 'Integration',
          title: 'One component across formats',
          description:
            'React, Vue and native JavaScript share source, session and capability contracts without duplicating format renderers.',
          tone: 'violet',
        },
        {
          label: 'Viewing experience',
          title: 'Controls that understand the document',
          description:
            'Full-document search, source hyperlinks, zoom, fullscreen, content-image preview and download, outlines, spreadsheet display modes, worksheet tabs, slide navigation, and speaker notes appear where the format supports them.',
          tone: 'neutral',
        },
      ],
    },
    formats: {
      eyebrow: 'Supported formats',
      title: 'Nine plugins, selected for your application.',
      description:
        'Each format has its own package. Registration stays lightweight. Extensions below are examples; see the format guides for full coverage and limits.',
      groups: [
        {
          category: 'Office',
          title: 'Word, Excel & PowerPoint',
          formats: ['DOCX', 'XLSX', 'PPTX'],
          description:
            'Read classic and modern Office files, including WPS documents and macro-enabled OOXML files. Macros are not executed.',
          capabilities: [
            'Outlines and search',
            'Worksheets and slides',
            'Readonly reviews',
          ],
          tone: 'document',
        },
        {
          category: 'PDF',
          title: 'Continuous PDF reading',
          formats: ['PDF'],
          description:
            'Scroll through every page; render visible pages first and recycle distant canvases within configured budgets.',
          capabilities: [
            'Outline and thumbnails',
            'Text search and selection',
            'Matching PDF.js assets included',
          ],
          tone: 'presentation',
        },
        {
          category: 'Images',
          title: 'Native image preview',
          formats: ['PNG', 'JPG', 'SVG', 'WEBP', 'AVIF'],
          description:
            'Open browser-supported images with shared pan, zoom and rotation interactions. AVIF support depends on the browser.',
          capabilities: [
            'Fit container',
            'Rotate and reset',
            'Shared Office image overlay',
          ],
          tone: 'spreadsheet',
        },
        {
          category: 'Text',
          title: 'Plain text & logs',
          formats: ['TXT', 'LOG', 'INI', 'CONF'],
          description:
            'Detect common Unicode and Chinese encodings; inspect other readable files through the optional text fallback.',
          capabilities: [
            'Encoding selection',
            'Line numbers and wrapping',
            'Windowed source view',
          ],
          tone: 'document',
        },
        {
          category: 'JSON',
          title: 'JSON, JSONC & JSON Lines',
          formats: ['JSON', 'JSONC', 'JSONL', 'NDJSON'],
          description:
            'Read source and structure side by side while retaining duplicate keys and exact numeric source text.',
          capabilities: [
            'Resizable split view',
            'Record-level diagnostics',
            'Tree-to-source navigation',
          ],
          tone: 'spreadsheet',
        },
        {
          category: 'Markdown',
          title: 'Markdown documents',
          formats: ['MD', 'MARKDOWN'],
          description:
            'Read GFM tables, tasks, code blocks and controlled HTML, with a shared outline and source view.',
          capabilities: [
            'Outline and search',
            'Lazy syntax highlighting',
            'Relative resource resolver',
          ],
          tone: 'presentation',
        },
        {
          category: 'CSV',
          title: 'CSV & TSV tables',
          formats: ['CSV', 'TSV'],
          description:
            'Inspect readonly tabular data with row and column windowing. Values remain strings and formulas do not execute.',
          capabilities: [
            'Delimiter selection',
            'Resizable columns',
            'TSV selection copy',
          ],
          tone: 'spreadsheet',
        },
        {
          category: 'XML',
          title: 'XML source & structure',
          formats: ['XML'],
          description:
            'View namespaces, attributes and mixed content in a resizable split view. DTD declarations are rejected.',
          capabilities: [
            'Source line numbers',
            'Colored structure values',
            'Source location mapping',
          ],
          tone: 'document',
        },
        {
          category: 'Code',
          title: 'Code & developer files',
          formats: ['TS', 'JS', 'PY', 'SCSS', 'YAML', 'Dockerfile'],
          description:
            'Preview common languages, configuration and build files as source. Source code is never executed.',
          capabilities: [
            'Language selection',
            'Line numbers by default',
            'Budgeted Worker highlighting',
          ],
          tone: 'presentation',
        },
      ],
      roadmapTitle: 'Explicit scope and release status',
      roadmapDescription:
        'Workspace version 0.1.0 is not yet published. Previews are readonly; editing, OCR, formula recalculation and pixel-perfect Office fidelity are outside the current scope.',
    },
    developer: {
      eyebrow: 'Developer experience',
      title: 'From install to preview in a few lines.',
      description:
        'Install a framework adapter and the standard plugin preset after release. Version 0.1.0 is currently unpublished; use workspace or local packages before release. PDF bundles matching resources; optional URL overrides are described in the PDF guide.',
      installLabel: 'Install',
      exampleLabel: 'React example',
      packageManagerLabel: 'Package manager',
      commands: {
        npm: 'npm install @filumo/react @filumo/viewer',
        yarn: 'yarn add @filumo/react @filumo/viewer',
      },
      example: `import { DocumentViewer } from '@filumo/react';
import { standardPlugins } from '@filumo/viewer';
export function Preview({ file }: { file?: File }) {
  return <DocumentViewer source={file} plugins={standardPlugins} options={{ height: 640 }} />;
}`,
      copy: 'Copy command',
      copied: 'Command copied',
      copyFailed: 'Select and copy manually',
      github: 'Read the source',
      npm: 'View package',
    },
    compatibility: {
      eyebrow: 'Compatibility',
      title: 'Choose your framework adapter.',
      description:
        'The viewer supports React 18/19 and Vue 2/3, ships as ESM, and includes its compiled component styles.',
      items: [
        { name: 'React', version: '18 / 19', note: '@filumo/react' },
        {
          name: 'Vue',
          version: '3.3+ / 2.6–2.7',
          note: '@filumo/vue / @filumo/vue2',
        },
        {
          name: 'JavaScript',
          version: 'ESM',
          note: '@filumo/dom · automatic styles',
        },
      ],
    },
    finalCta: {
      title: 'Bring file previews into your application.',
      description:
        'Try a local file, then choose your adapter, format plugins and resource limits.',
      demo: 'Open the demo',
      github: 'Star on GitHub',
    },
    footer: {
      description:
        'Open-source browser file previews for React, Vue and JavaScript.',
      license: 'MIT License',
      builtWith: 'Built for the browser',
    },
  },
  'zh-CN': {
    htmlLang: 'zh-CN',
    languageLabel: 'English',
    languageHref: SITE_ROOT,
    docsHref: `${SITE_ROOT}zh-CN/docs`,
    playgroundHref: `${SITE_ROOT}zh-CN/playground`,
    skipToContent: '跳转到主要内容',
    navigation: {
      ariaLabel: '主导航',
      docs: '开发文档',
      overview: '产品介绍',
      demo: '在线体验',
      highlights: '优点亮点',
      formats: '支持格式',
      github: 'GitHub',
      npm: 'npm',
    },
    documentation: {
      tocTitle: '文档目录',
      openToc: '文档目录',
      closeToc: '关闭文档目录',
    },
    hero: {
      eyebrow: 'Filumo 0.1.0 · 开源文件预览组件',
      title: '在浏览器中预览多种文件',
      description:
        'Office、PDF、图片、文本与结构化文件共用统一预览器，支持 React、Vue 3、Vue 2 和原生 JavaScript 接入。',
      primaryAction: '体验本地文件',
      secondaryAction: '查看 GitHub',
      privacy: '无需上传，无需转换服务，文件始终保留在当前标签页。',
      copy: '复制',
      copied: '已复制',
      copyFailed: '请手动复制',
    },
    productFlow: {
      title: '本地预览流程',
      status: '仅在浏览器中',
      fileName: '你的文件',
      fileMeta: 'File API · 本地来源',
      stages: [
        {
          index: '01',
          title: '选择',
          description: '从当前设备选择文件。',
        },
        {
          index: '02',
          title: '解析',
          description: '按需加载对应格式的解析与视图。',
        },
        {
          index: '03',
          title: '渲染',
          description: '由公共 DOM 预览器呈现内容。',
        },
      ],
      privacyTitle: '文件始终保留在本地',
      privacyDescription: '在线示例不会把你选择的文档发送到上传服务。',
    },
    overview: {
      eyebrow: '产品介绍',
      title: '一个预览器，九类格式插件。',
      description:
        'Filumo 是浏览器端文件预览组件，由独立格式包与轻量框架适配器组成，本地文件无需经过上传或转换服务。',
      details:
        '适用于文档中心、附件预览、知识库和开发工具。可只安装需要的格式包，也可选择标准插件预设。',
      capabilities: [
        {
          index: '01',
          title: '接收已有的文件来源',
          description:
            '统一接收 File、Blob、Uint8Array、URL 或 DocumentSource 来源工厂，不必为每种格式重新设计来源接口。',
        },
        {
          index: '02',
          title: '管理完整预览生命周期',
          description:
            '格式识别、解析进度、取消、错误处理和资源释放都集中在一个组件边界内。',
        },
        {
          index: '03',
          title: '根据文件调整预览界面',
          description:
            '统一外壳按格式提供页面、原文、大纲、结构树和查找等适用能力。',
        },
      ],
      useCasesLabel: '典型使用场景',
      useCases: ['文档管理系统', '企业知识库', '业务附件预览', '隐私敏感工具'],
      facts: [
        { value: '0.1.0', label: '当前工作区版本' },
        { value: '9', label: '类格式插件' },
        { value: '15', label: '个工作区包' },
      ],
      architecture: {
        imageSrc: `${SITE_ROOT}assets/filumo-architecture-flow.zh-cn.svg`,
        imageAlt:
          'Filumo 架构：来源与会话协议、公共 DOM 外壳、九类按需加载的格式插件和框架适配层。',
      },
    },
    demo: {
      eyebrow: '在线体验',
      title: '从你的设备打开一个文件。',
      description:
        '选择 Office、PDF、图片、文本、JSON、Markdown、CSV、XML 或代码文件，在当前浏览器内预览。',
      privacyTitle: '默认保护隐私',
      privacyDescription: '本页面不会把你选择的文件上传到服务器。',
      action: '打开在线体验',
    },
    highlights: {
      eyebrow: '优点亮点',
      title: '面向业务系统的多格式预览能力。',
      description:
        '统一接入不同文件类型，并按格式提供适合的操作，明确资源限制与生命周期。',
      items: [
        {
          label: '隐私',
          title: '从架构上保持浏览器本地处理',
          description:
            '本地文件直接在浏览器中读取、解析和渲染，不要求配套部署上传服务或文档转换服务。',
          tone: 'primary',
        },
        {
          label: '性能',
          title: '为较大文件保持界面响应',
          description:
            '格式引擎按需加载，文本和结构树窗口化，PDF 画布按预算回收；实际性能仍取决于文件规模与浏览器。',
          tone: 'cyan',
        },
        {
          label: '接入',
          title: '多种格式共用一个组件 API',
          description:
            'React、Vue 与原生 JavaScript 复用来源、会话与能力协议，各格式无需重新实现框架渲染器。',
          tone: 'violet',
        },
        {
          label: '体验',
          title: '根据文档类型提供对应操作',
          description:
            '在格式支持时提供全文查找、源文档超链接、缩放、全屏、内容图片预览与下载、大纲、电子表格显示模式、工作表标签、幻灯片导航和演讲者备注等能力。',
          tone: 'neutral',
        },
      ],
    },
    formats: {
      eyebrow: '支持格式',
      title: '九类插件，按需组合。',
      description:
        '每类格式由独立包提供，注册描述符不会提前加载全部引擎。下列扩展名为代表，完整识别范围与限制见格式指南。',
      groups: [
        {
          category: 'Office',
          title: 'Word、Excel 与 PowerPoint',
          formats: ['DOCX', 'XLSX', 'PPTX'],
          description:
            '预览传统与现代 Office 文件，含 WPS 文档及支持的宏启用 OOXML 格式；不执行宏。',
          capabilities: ['大纲与查找', '工作表与幻灯片', '只读修订和批注'],
          tone: 'document',
        },
        {
          category: 'PDF',
          title: 'PDF 连续阅读',
          formats: ['PDF'],
          description:
            '所有页面连续纵向排布，可见页优先绘制，远端高清画布按配置预算回收。',
          capabilities: [
            '大纲、缩略图与查找',
            '文字选择与旋转',
            '包内集成同版 PDF.js 资源',
          ],
          tone: 'presentation',
        },
        {
          category: '图片',
          title: '独立图片预览',
          formats: ['PNG', 'JPG', 'SVG', 'WEBP', 'AVIF'],
          description:
            '使用浏览器原生解码及公共拖动、缩放、旋转交互；AVIF 支持取决于浏览器。',
          capabilities: ['适应容器', '旋转与复位', '复用 Office 图片弹层'],
          tone: 'spreadsheet',
        },
        {
          category: '纯文本',
          title: '文本与日志',
          formats: ['TXT', 'LOG', 'INI', 'CONF'],
          description:
            '自动识别常见 Unicode 和中文编码，并可对其他可读文件启用文本兜底。',
          capabilities: ['编码切换', '行号与自动换行', '原文窗口化'],
          tone: 'document',
        },
        {
          category: 'JSON',
          title: 'JSON、JSONC 与 JSON Lines',
          formats: ['JSON', 'JSONC', 'JSONL', 'NDJSON'],
          description:
            '原文与结构双栏阅读，保留重复键及原始数字文本，不因解析丢失精度。',
          capabilities: ['拖动调整双栏', '记录独立诊断', '结构定位原文'],
          tone: 'spreadsheet',
        },
        {
          category: 'Markdown',
          title: 'Markdown 文档',
          formats: ['MD', 'MARKDOWN'],
          description:
            '支持 GFM 表格、任务列表、代码块与受控 HTML，提供统一大纲及原文视图。',
          capabilities: ['大纲与查找', '按需代码高亮', '相对资源解析'],
          tone: 'presentation',
        },
        {
          category: 'CSV',
          title: 'CSV 与 TSV 表格',
          formats: ['CSV', 'TSV'],
          description: '只读表格按行列窗口化，字段保持字符串，不执行公式。',
          capabilities: ['分隔符切换', '调整列宽', '选区 TSV 复制'],
          tone: 'spreadsheet',
        },
        {
          category: 'XML',
          title: 'XML 原文与结构',
          formats: ['XML'],
          description:
            '双栏查看命名空间、属性和混合内容，支持拖动调整比例；拒绝 DTD 声明。',
          capabilities: ['原文行号', '结构值分色', '定位源范围'],
          tone: 'document',
        },
        {
          category: '代码',
          title: '代码与开发文件',
          formats: ['TS', 'JS', 'PY', 'SCSS', 'YAML', 'Dockerfile'],
          description:
            '以原文预览常用语言、配置和构建文件，不执行代码；高亮超预算时保留普通原文。',
          capabilities: ['语言切换', '默认显示行号', 'Worker 按需高亮'],
          tone: 'presentation',
        },
      ],
      roadmapTitle: '明确支持范围与发布状态',
      roadmapDescription:
        '当前工作区版本为 0.1.0，尚未发布。预览均为只读，不提供编辑保存、OCR、公式重算或完整 Office 排版保证。',
    },
    developer: {
      eyebrow: '开发者体验',
      title: '几行代码即可完成安装与预览。',
      description:
        '发布后安装框架适配器与标准插件预设。0.1.0 当前尚未发布，发布前使用工作区或本地包。PDF 默认集成同版资源，特殊部署可覆盖资源地址。',
      installLabel: '安装',
      exampleLabel: 'React 示例',
      packageManagerLabel: '包管理器',
      commands: {
        npm: 'npm install @filumo/react @filumo/viewer',
        yarn: 'yarn add @filumo/react @filumo/viewer',
      },
      example: `import { DocumentViewer } from '@filumo/react';
import { standardPlugins } from '@filumo/viewer';
export function Preview({ file }: { file?: File }) {
  return <DocumentViewer source={file} plugins={standardPlugins} options={{ height: 640 }} />;
}`,
      copy: '复制命令',
      copied: '命令已复制',
      copyFailed: '请选择后手动复制',
      github: '查看源代码',
      npm: '查看 npm 包',
    },
    compatibility: {
      eyebrow: '兼容性',
      title: '按你的技术栈选择适配器。',
      description:
        '预览器支持 React 18/19 与 Vue 2/3，以 ESM 发布，并随包提供已编译的组件样式。',
      items: [
        { name: 'React', version: '18 / 19', note: '@filumo/react' },
        {
          name: 'Vue',
          version: '3.3+ / 2.6–2.7',
          note: '@filumo/vue / @filumo/vue2',
        },
        { name: 'JavaScript', version: 'ESM', note: '@filumo/dom · 自动样式' },
      ],
    },
    finalCta: {
      title: '把多格式文件预览接入你的应用。',
      description: '先用本地文件体验，再选择适配器、格式插件与资源限制。',
      demo: '打开在线体验',
      github: '在 GitHub 点星',
    },
    footer: {
      description: '面向 React、Vue 和 JavaScript 的开源浏览器文件预览。',
      license: 'MIT 许可证',
      builtWith: '为浏览器而构建',
    },
  },
};

/** 根据公开页面语言返回结构一致的网站文案。 */
export function getWebsiteContent(locale: WebsiteLocale): WebsiteContent {
  return WEBSITE_CONTENT[locale];
}
