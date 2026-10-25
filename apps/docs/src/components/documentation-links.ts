import { normalizeDocsBase } from '../../config/base-path.js';
import { getDocumentationPages } from '../../config/doc-pages';
import { DOCS_BASE } from '../site-path';
import type { DocumentationHeading } from './documentation-tree';

export type DocumentationLocale = 'en-US' | 'zh-CN';

/** 去除部署前缀和语言前缀，页面地址与语言切换共用同一规范。 */
export function documentationRoute(pathname: string, base = DOCS_BASE): string {
  const prefix = normalizeDocsBase(base);
  const path =
    prefix !== '/' && pathname === prefix.slice(0, -1)
      ? '/'
      : pathname.startsWith(prefix) && prefix !== '/'
      ? '/' + pathname.slice(prefix.length)
      : pathname;
  return (
    '/' +
    path
      .replace(/^\//, '')
      .replace(/^zh-CN(?:\/|$)/, '')
      .replace(/\/$/, '')
  );
}

/** 目标标题 ID 相同时直接保留，否则按双语同序章节映射；未知锚点不能继续传播。 */
export function translateDocumentationHash(
  hash: string,
  current: readonly DocumentationHeading[],
  target: readonly DocumentationHeading[],
): string {
  if (!hash) return '';
  let id: string;
  try {
    id = decodeURIComponent(hash.replace(/^#/, ''));
  } catch {
    return '';
  }
  if (target.some((heading) => heading.id === id))
    return '#' + encodeURIComponent(id);
  const index = current.findIndex((heading) => heading.id === id);
  return index >= 0 && target[index]?.depth === current[index].depth
    ? '#' + encodeURIComponent(target[index].id)
    : '';
}

/** 共享固定锚点由 API 手工声明，目录元数据没有收录时仍能在两种语言中保持有效。 */
const ANCHOR_PAGES: Record<string, string> = {
  '#quick-start': 'quick-start',
  '#viewer-options': 'viewer-api',
  '#capabilities': 'viewer-api',
  '#office-options': 'viewer-api',
  '#development': 'testing',
};

/** 手工锚点只在声明它的页面中通用，不能把其他页面的同名 hash 当作有效目标。 */
export function sharedDocumentationAnchor(
  pathname: string,
  hash: string,
): boolean {
  const page = ANCHOR_PAGES[hash];
  const route = documentationRoute(pathname);
  return Boolean(
    page && (route === '/docs' || route === '/docs/guides/' + page),
  );
}

/** 保留旧总览链接的访问入口，统一转向新的专用页面。 */
export function legacyDocumentationTarget(
  pathname: string,
  hash: string,
): string | undefined {
  const route = documentationRoute(pathname);
  if (route !== '/docs') return undefined;
  const slug = ANCHOR_PAGES[hash];
  if (!slug) return undefined;
  const locale = /(?:^|\/)zh-CN\//.test(pathname) ? '/zh-CN' : '';
  return locale + '/docs/guides/' + slug + hash;
}

/** 总览拆分后，旧 API 标题只在新页确实保留该标题时跳转，避免制造新的失效锚点。 */
export function legacyDocumentationHeading(
  pathname: string,
  hash: string,
  current: readonly DocumentationHeading[],
  targetRoute: string,
  target: readonly DocumentationHeading[],
): string | undefined {
  if (documentationRoute(pathname) !== '/docs') return undefined;
  let id: string;
  try {
    id = decodeURIComponent(hash.replace(/^#/, ''));
  } catch {
    return undefined;
  }
  if (!id || current.some((heading) => heading.id === id)) return undefined;
  return target.some((heading) => heading.id === id)
    ? targetRoute + '#' + encodeURIComponent(id)
    : undefined;
}

/** 页尾导航始终遵循与左侧目录相同的页面清单。 */
export function documentationNeighbors(
  pathname: string,
  locale: DocumentationLocale,
) {
  const pages = getDocumentationPages(locale);
  const normalized =
    (locale === 'zh-CN' ? '/zh-CN' : '') + documentationRoute(pathname);
  const index = pages.findIndex((page) => page.route === normalized);
  return index < 0
    ? undefined
    : {
        current: pages[index],
        previous: pages[index - 1],
        next: pages[index + 1],
      };
}
