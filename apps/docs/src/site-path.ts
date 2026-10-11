import { normalizeDocsBase, withDocsBase } from '../config/base-path.js';

// Dumi 将同一个值注入浏览器；不把 Node 环境或旧仓库名带入站点路由。
export const DOCS_BASE = normalizeDocsBase(process.env.FIVO_DOCS_BASE);

/** 当前构建下的站内页面、资产和开发烟测请求地址。 */
export function docsPath(route = ''): string {
  return withDocsBase(DOCS_BASE, route);
}
