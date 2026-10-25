// 配置阶段注入每个包的实际版本，文档模块不依赖包入口或 npm 网络请求。
export const DOCUMENTATION_VERSIONS: Readonly<Record<string, string>> =
  JSON.parse(process.env.FILUMO_DOCS_VERSIONS || '{}');
export const DOCUMENTATION_BASELINE =
  DOCUMENTATION_VERSIONS['@filumo/viewer'] || 'workspace';
