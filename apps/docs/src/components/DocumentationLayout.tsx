import {
  Helmet,
  getRouteMetaById,
  history,
  useAppData,
  useIntl,
  useLocation,
  useOutlet,
  useRouteMeta,
  useSiteData,
} from 'dumi';
import React, { useEffect } from 'react';
import { DOCS_BASE } from '../site-path';
import { DocumentationHeader } from './DocumentationHeader';
import { DocumentationPageFooter } from './DocumentationPageFooter';
import { DocumentationToc } from './DocumentationToc';
import { SiteFooter } from './SiteFooter';
import './documentation-layout.less';
import {
  legacyDocumentationHeading,
  legacyDocumentationTarget,
} from './documentation-links';
import { documentationSeo } from './documentation-seo';
import { getWebsiteContent, type WebsiteLocale } from './home-content';

/** 解码路由哈希；遇到非法转义时保留原值，避免导航过程抛出异常。 */
function getHashTargetId(hash: string): string {
  const encodedId = hash.replace(/^#/, '');

  try {
    return decodeURIComponent(encodedId);
  } catch {
    return encodedId;
  }
}

/** 为公开文档编排品牌导航、目录、Markdown 正文与站点页脚。 */
export function DocumentationLayout() {
  const intl = useIntl();
  const outlet = useOutlet();
  const routeMeta = useRouteMeta();
  const { routes } = useAppData();
  const { hash, pathname } = useLocation();
  const { loading } = useSiteData();
  const locale: WebsiteLocale = intl.locale === 'zh-CN' ? 'zh-CN' : 'en-US';
  const content = getWebsiteContent(locale);
  const frontmatter = routeMeta.frontmatter;
  const siteLayout = (frontmatter as { siteLayout?: unknown }).siteLayout;
  const seo = documentationSeo(pathname, DOCS_BASE);

  useEffect(() => {
    const legacy = legacyDocumentationTarget(pathname, hash);
    if (legacy) {
      history.replace(legacy);
      return;
    }
    const apiRoute =
      (locale === 'zh-CN' ? '/zh-CN' : '') + '/docs/guides/viewer-api';
    const api = Object.entries(routes).find(
      ([, route]) =>
        '/' + String(route.path).replace(/^\//, '').replace(/\/$/, '') ===
        apiRoute,
    );
    const targetToc = api
      ? getRouteMetaById(api[0], { syncOnly: true })?.toc ?? []
      : [];
    const heading = legacyDocumentationHeading(
      pathname,
      hash,
      routeMeta.toc,
      apiRoute,
      targetToc,
    );
    if (heading) {
      history.replace(heading);
      return;
    }
    const currentHash = hash || window.location.hash;

    if (loading || !currentHash) {
      return;
    }

    let scrollFrame = 0;
    const renderFrame = window.requestAnimationFrame(() => {
      // 等正文完成下一帧绘制，覆盖浏览器首屏原生锚点的提前定位。
      scrollFrame = window.requestAnimationFrame(() => {
        const target = document.getElementById(getHashTargetId(currentHash));

        if (target) {
          const marginTop =
            Number.parseFloat(
              window.getComputedStyle(target).scrollMarginTop,
            ) || 0;
          const targetTop =
            target.getBoundingClientRect().top + window.scrollY - marginTop;
          window.scrollTo({ top: targetTop, behavior: 'auto' });
        }
      });
    });

    return () => {
      window.cancelAnimationFrame(renderFrame);
      window.cancelAnimationFrame(scrollFrame);
    };
  }, [hash, loading, pathname, locale, routeMeta.toc, routes]);

  const metadata = (
    <Helmet>
      <html lang={content.htmlLang} />
      {frontmatter.title && <title>{frontmatter.title}</title>}
      {frontmatter.title && (
        <meta property="og:title" content={frontmatter.title} />
      )}
      {frontmatter.description && (
        <meta name="description" content={frontmatter.description} />
      )}
      {frontmatter.description && (
        <meta property="og:description" content={frontmatter.description} />
      )}
      {frontmatter.keywords && (
        <meta name="keywords" content={frontmatter.keywords.join(',')} />
      )}
      {frontmatter.keywords?.map((keyword) => (
        <meta key={keyword} property="article:tag" content={keyword} />
      ))}
      <link rel="canonical" href={seo.canonical} />
      <link rel="alternate" hrefLang="en-US" href={seo.en} />
      <link rel="alternate" hrefLang="zh-CN" href={seo.zh} />
      <link rel="alternate" hrefLang="x-default" href={seo.en} />
    </Helmet>
  );

  if (siteLayout !== 'docs') {
    return (
      <>
        {metadata}
        {outlet}
      </>
    );
  }

  return (
    <div className="office-viewer-docs" lang={content.htmlLang}>
      {metadata}
      <a className="office-viewer-site-skip" href="#main-content">
        {content.skipToContent}
      </a>
      <DocumentationHeader locale={locale} />
      <main id="main-content" className="office-viewer-docs__main">
        <div className="office-viewer-docs__grid" data-has-toc="true">
          <DocumentationToc locale={locale} />
          <section className="office-viewer-docs__content">
            <article
              className={
                'office-viewer-docs__article markdown' +
                (/\/(?:viewer-api|plugin-api)\/?$/.test(pathname)
                  ? ' is-api-reference'
                  : '')
              }
              tabIndex={-1}
            >
              {outlet}
            </article>
            <DocumentationPageFooter
              pathname={pathname}
              locale={locale}
              updated={frontmatter.lastUpdated}
            />
          </section>
        </div>
      </main>
      <SiteFooter content={content} />
    </div>
  );
}
