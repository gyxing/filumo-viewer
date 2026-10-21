/** 本地默认根路径；部署前缀必须是站内路径，统一补齐末尾斜杠。 */
export function normalizeDocsBase(value = '/') {
  const base = value.trim() || '/';
  if (
    !/^\/(?:[a-zA-Z0-9._~-]+\/?)*$/.test(base) ||
    base.split('/').some((part) => part === '.' || part === '..')
  ) {
    throw new Error('FILUMO_DOCS_BASE 必须是合法站内路径，例如 / 或 /preview/');
  }
  return base.endsWith('/') ? base : base + '/';
}

/** 拼接文档站内部链接，不从当前页面层级猜测部署前缀。 */
export function withDocsBase(base, route = '') {
  return normalizeDocsBase(base) + route.replace(/^\//, '');
}
