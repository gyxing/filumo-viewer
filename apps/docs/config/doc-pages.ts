// 文档路由与侧栏共用白名单，避免漏掉指南，也不暴露本机烟测或业务样本。
export const DOC_GUIDES = [
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
    title: { 'en-US': 'Migration to Fivo', 'zh-CN': '迁移到 Fivo' },
  },
  {
    slug: 'testing',
    file: 'testing',
    title: { 'en-US': 'Development & testing', 'zh-CN': '本地开发与测试' },
  },
] as const;
