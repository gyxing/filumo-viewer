// 路由、目录与上下篇使用同一份阅读顺序；不收录本机烟测或业务样本。
export const DOC_GROUPS = [
  { id: 'start', title: { 'en-US': 'Getting started', 'zh-CN': '开始使用' } },
  {
    id: 'integration',
    title: { 'en-US': 'Framework adapters', 'zh-CN': '框架适配' },
  },
  {
    id: 'formats',
    title: { 'en-US': 'Formats and reading', 'zh-CN': '格式与阅读能力' },
  },
  { id: 'api', title: { 'en-US': 'API reference', 'zh-CN': 'API 参考' } },
  {
    id: 'deployment',
    title: { 'en-US': 'Deployment and troubleshooting', 'zh-CN': '部署与排错' },
  },
  {
    id: 'maintenance',
    title: { 'en-US': 'Maintenance and extensions', 'zh-CN': '维护与扩展' },
  },
] as const;

export const DOC_GUIDES = [
  {
    slug: 'quick-start',
    file: 'quick-start',
    group: 'start',
    title: { 'en-US': 'Quick start', 'zh-CN': '快速开始' },
  },
  {
    slug: 'packages',
    file: 'packages',
    group: 'start',
    title: { 'en-US': 'Packages & installation', 'zh-CN': '包总览与安装' },
  },
  {
    slug: 'image-pdf',
    file: 'image-pdf',
    group: 'formats',
    title: { 'en-US': 'Images & PDF', 'zh-CN': '图片与 PDF' },
  },
  {
    slug: 'text-formats',
    file: 'text-formats',
    group: 'formats',
    title: {
      'en-US': 'Text, JSON, Markdown, CSV, XML & Code',
      'zh-CN': '文本与结构化格式',
    },
  },
  {
    slug: 'preview-integration',
    file: 'preview-integration',
    group: 'integration',
    title: { 'en-US': 'Framework integration', 'zh-CN': '框架接入指南' },
  },
  {
    slug: 'compatibility',
    file: 'compatibility',
    group: 'formats',
    title: { 'en-US': 'Compatibility & limits', 'zh-CN': '兼容范围与限制' },
  },
  {
    slug: 'extension-contracts',
    file: 'extension-contracts',
    group: 'maintenance',
    title: {
      'en-US': 'Plugins & future editing',
      'zh-CN': '插件与后续编辑扩展',
    },
  },
  {
    slug: 'migration',
    file: 'migration-from-office-file-viewer',
    group: 'maintenance',
    title: { 'en-US': 'Migration to Filumo', 'zh-CN': '迁移到 Filumo' },
  },
  {
    slug: 'testing',
    file: 'testing',
    group: 'maintenance',
    title: { 'en-US': 'Development & testing', 'zh-CN': '本地开发与测试' },
  },
  {
    slug: 'viewer-api',
    file: 'viewer-api',
    group: 'api',
    title: { 'en-US': 'Viewer API', 'zh-CN': '查看器 API' },
  },
  {
    slug: 'plugin-api',
    file: 'plugin-api',
    group: 'api',
    title: { 'en-US': 'Plugin options', 'zh-CN': '格式插件参数' },
  },
  {
    slug: 'deployment',
    file: 'deployment',
    group: 'deployment',
    title: { 'en-US': 'Production deployment', 'zh-CN': '生产部署' },
  },
  {
    slug: 'troubleshooting',
    file: 'troubleshooting',
    group: 'deployment',
    title: { 'en-US': 'Troubleshooting', 'zh-CN': '问题排查' },
  },
] as const;

/** 根据语言生成稳定的页面顺序，兼顾旧总览入口和新分组。 */
export function getDocumentationPages(locale: 'en-US' | 'zh-CN') {
  const prefix = locale === 'zh-CN' ? '/zh-CN' : '';
  return [
    {
      route: prefix + '/docs',
      file: 'docs',
      group: 'start',
      title: locale === 'zh-CN' ? '概览与 API' : 'Overview & API',
    },
    ...DOC_GROUPS.flatMap((group) =>
      DOC_GUIDES.filter((page) => page.group === group.id).map((page) => ({
        route: prefix + '/docs/guides/' + page.slug,
        file: 'guides/' + page.file,
        group: page.group,
        title: page.title[locale],
      })),
    ),
  ];
}
