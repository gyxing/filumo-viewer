import React from 'react';
import { docsPath } from '../site-path';
import { documentationNeighbors } from './documentation-links';
import { GITHUB_URL, type WebsiteLocale } from './home-content';

/** 上下篇与目录共用注册表；编辑链接始终指向当前语言的真实 Markdown 文件。 */
export function DocumentationPageFooter({
  pathname,
  locale,
  updated,
}: {
  pathname: string;
  locale: WebsiteLocale;
  updated?: number;
}) {
  const pages = documentationNeighbors(pathname, locale);
  if (!pages) return null;
  const en = locale === 'en-US';
  const suffix = en ? '.md' : '.zh-CN.md';
  return (
    <footer className="filumo-doc-page-footer">
      <div>
        <a
          href={
            GITHUB_URL +
            '/edit/master/apps/docs/docs/' +
            pages.current.file +
            suffix
          }
          target="_blank"
          rel="noreferrer"
        >
          {en ? 'Edit this page' : '编辑此页'}
        </a>
        {updated && Number.isFinite(new Date(updated).getTime()) ? (
          <time dateTime={new Date(updated).toISOString()}>
            {(en ? 'Updated: ' : '更新于：') +
              new Date(updated).toISOString().slice(0, 10)}
          </time>
        ) : null}
      </div>
      <nav aria-label={en ? 'Document navigation' : '文档上下篇'}>
        {pages.previous ? (
          <a href={docsPath(pages.previous.route)}>
            <small>{en ? 'Previous' : '上一篇'}</small>
            <strong>{pages.previous.title}</strong>
          </a>
        ) : (
          <span />
        )}
        {pages.next ? (
          <a href={docsPath(pages.next.route)}>
            <small>{en ? 'Next' : '下一篇'}</small>
            <strong>{pages.next.title}</strong>
          </a>
        ) : null}
      </nav>
    </footer>
  );
}
