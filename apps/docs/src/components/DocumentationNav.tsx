import { useLocation } from 'dumi';
import React from 'react';
import { DOC_GUIDES } from '../../config/doc-pages';
import { docsPath } from '../site-path';
import type { WebsiteLocale } from './home-content';

/** 文档目录先列接入与开发指南，再由右侧/下方的页内目录定位章节。 */
export function DocumentationNav({ locale }: { locale: WebsiteLocale }) {
  const { pathname } = useLocation();
  // 路由位置不带部署 base，导航 href 则必须包含它。
  const currentPath = docsPath(pathname.replace(/^\//, '').replace(/\/$/, ''));
  const prefix = locale === 'zh-CN' ? 'zh-CN/' : '';
  const pages = [
    {
      href: docsPath(prefix + 'docs'),
      title: locale === 'zh-CN' ? '概览与 API' : 'Overview & API',
    },
    ...DOC_GUIDES.map((page) => ({
      href: docsPath(prefix + 'docs/guides/' + page.slug),
      title: page.title[locale],
    })),
  ];
  return (
    <nav
      className="fivo-doc-navigation"
      aria-label={
        locale === 'zh-CN' ? '开发文档导航' : 'Documentation navigation'
      }
    >
      {pages.map((page) => (
        <a
          key={page.href}
          href={page.href}
          aria-current={currentPath === page.href ? 'page' : undefined}
        >
          {page.title}
        </a>
      ))}
    </nav>
  );
}
