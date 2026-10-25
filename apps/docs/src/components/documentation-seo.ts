import { normalizeDocsBase } from '../../config/base-path.js';
import { getDocumentationPages } from '../../config/doc-pages';
import { documentationRoute } from './documentation-links';

export const DOCS_ORIGIN =
  process.env.FILUMO_DOCS_ORIGIN || 'https://gyxing.github.io';

/** canonical 和双语地址均包含部署目录，避免被指向 GitHub Pages 的站点根路径。 */
export function documentationSeo(
  pathname: string,
  base: string,
  origin = DOCS_ORIGIN,
) {
  const site = new URL(origin);
  // origin 不能携带凭据或项目路径，避免把秘密写进公开链接或重复拼接部署目录。
  if (
    !['http:', 'https:'].includes(site.protocol) ||
    site.username ||
    site.password ||
    site.pathname !== '/' ||
    site.search ||
    site.hash
  )
    throw new Error(
      'FILUMO_DOCS_ORIGIN 必须是不含路径或凭据的 HTTP(S) 站点地址',
    );
  const prefix = normalizeDocsBase(base);
  const route = documentationRoute(pathname, base).replace(/^\//, '');
  const en = new URL(prefix + route, site.origin).href;
  const zh = new URL(prefix + 'zh-CN/' + route, site.origin).href;
  return {
    canonical: /(?:^|\/)zh-CN(?:\/|$)/.test(pathname) ? zh : en,
    en,
    zh,
  };
}

/** 构建输出仅包含公开路由，绝不把烟测、临时示例或本机样本写入 sitemap。 */
export function documentationSitemap(
  base: string,
  origin = DOCS_ORIGIN,
): string {
  const routes = [
    '/',
    '/playground',
    ...getDocumentationPages('en-US').map((page) => page.route),
  ];
  const escape = (value: string) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;');
  const entries = routes.flatMap((route) => {
    const links = documentationSeo(route, base, origin);
    return [links.en, links.zh].map(
      (url) =>
        '<url><loc>' +
        escape(url) +
        '</loc>' +
        '<xhtml:link rel="alternate" hreflang="en-US" href="' +
        escape(links.en) +
        '"/>' +
        '<xhtml:link rel="alternate" hreflang="zh-CN" href="' +
        escape(links.zh) +
        '"/></url>',
    );
  });
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">' +
    entries.join('') +
    '</urlset>\n'
  );
}
