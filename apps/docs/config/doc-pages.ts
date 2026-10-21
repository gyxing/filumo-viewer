// 文档路由与侧栏共用白名单，避免漏掉指南，也不暴露本机烟测或业务样本。
export const DOC_GUIDES = [
  {
    slug: 'packages',
    file: 'packages',
    title: { 'en-US': 'Packages & installation', 'zh-CN': '包总览与安装' },
  },
  {
    slug: 'image-pdf',
    file: 'image-pdf',
    title: { 'en-US': 'Images & PDF', 'zh-CN': '图片与 PDF' },
  },
  {
    slug: 'text-formats',
    file: 'text-formats',
    title: {
      'en-US': 'Text, JSON, Markdown, CSV, XML & Code',
      'zh-CN': '文本与结构化格式',
    },
  },
  {
    slug: 'preview-integration',
    file: 'preview-integration',
    title: { 'en-US': 'Framework integration', 'zh-CN': '框架接入指南' },
  },
  {
    slug: 'compatibility',
    file: 'compatibility',
    title: { 'en-US': 'Compatibility & limits', 'zh-CN': '兼容范围与限制' },
  },
  {
    slug: 'extension-contracts',
    file: 'extension-contracts',
    title: {
      'en-US': 'Plugins & future editing',
      'zh-CN': '插件与后续编辑扩展',
    },
  },
  {
    slug: 'migration',
    file: 'migration-from-office-file-viewer',
    title: { 'en-US': 'Migration to Filumo', 'zh-CN': '迁移到 Filumo' },
  },
  {
    slug: 'testing',
    file: 'testing',
    title: { 'en-US': 'Development & testing', 'zh-CN': '本地开发与测试' },
  },
] as const;
