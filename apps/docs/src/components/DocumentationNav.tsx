import { Tree } from 'antd';
import {
  getRouteMetaById,
  history,
  useAppData,
  useLocation,
  useRouteMeta,
  useSiteData,
} from 'dumi';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DOC_GROUPS, getDocumentationPages } from '../../config/doc-pages';
import { docsPath } from '../site-path';
import {
  buildDocumentationTree,
  getDocumentationAncestors,
  getDocumentationHeading,
  getVisibleDocumentationKey,
  type DocumentationTreeNode,
} from './documentation-tree';
import type { WebsiteLocale } from './home-content';
import { useDocumentationHeading } from './useDocumentationHeading';

/** 用原生 Tree 呈现所有文档的章节，展开分支不触发页面跳转。 */
export function DocumentationNav({
  locale,
  drawerOpen = false,
  onNavigate,
}: {
  locale: WebsiteLocale;
  drawerOpen?: boolean;
  onNavigate?(): void;
}) {
  const { pathname, search, hash } = useLocation();
  const { toc } = useRouteMeta();
  const { routes } = useAppData();
  const { loading } = useSiteData();
  const model = useMemo(() => {
    const routeIds = new Map<string, string>();
    for (const [id, route] of Object.entries(routes)) {
      if (typeof route.path !== 'string') continue;
      routeIds.set('/' + route.path.split('/').filter(Boolean).join('/'), id);
    }
    const pages = getDocumentationPages(locale).map((page) => {
      const id = routeIds.get(page.route);
      // 只读同步目录元数据，不触发正文、搜索文本或示例组件的加载。
      const metadata = id
        ? getRouteMetaById(id, { syncOnly: true })
        : undefined;
      return {
        ...page,
        href: docsPath(page.route),
        headings: metadata?.toc ?? [],
      };
    });
    return buildDocumentationTree(
      pages,
      pathname,
      toc,
      DOC_GROUPS.map((group) => ({ id: group.id, title: group.title[locale] })),
    );
  }, [locale, pathname, routes, toc]);
  const activeHeading = useDocumentationHeading(
    model.headings,
    pathname,
    loading,
  );
  const selectedKey = activeHeading ?? model.currentPageKey;
  const [expandedKeys, setExpandedKeys] = useState<string[]>([
    ...model.nodes
      .filter((node) => node.kind === 'group')
      .map((node) => node.key),
    model.currentPageKey,
  ]);
  const visibleSelectedKey = getVisibleDocumentationKey(
    model,
    selectedKey,
    expandedKeys,
  );
  const navigationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const target = getDocumentationHeading(model, hash);
    const ancestors = target ? getDocumentationAncestors(model, target) : [];
    // 切换文档保留已展开的其他分支，只清除失效节点；滚动高亮不强制展开。
    setExpandedKeys((previous) =>
      Array.from(
        new Set([
          ...previous.filter((key) => model.byKey.has(key)),
          model.currentPageKey,
          ...getDocumentationAncestors(model, model.currentPageKey),
          ...ancestors,
        ]),
      ),
    );
  }, [hash, model]);

  useEffect(() => {
    const navigation = navigationRef.current;
    if (
      !navigation ||
      window.getComputedStyle(navigation).visibility === 'hidden'
    )
      return;
    // 当前 rc-tree 用选中类标记节点，只在越出目录视口时调整滚动，不接管标题渲染。
    const selected = navigation.querySelector<HTMLElement>(
      '.ant-tree-treenode-selected',
    );
    if (!selected) return;
    const bounds = navigation.getBoundingClientRect();
    const row = selected.getBoundingClientRect();
    if (row.top < bounds.top + 4)
      navigation.scrollTop += row.top - bounds.top - 4;
    else if (row.bottom > bounds.bottom - 4)
      navigation.scrollTop += row.bottom - bounds.bottom + 4;
  }, [drawerOpen, expandedKeys, visibleSelectedKey]);

  const activate = (node: DocumentationTreeNode) => {
    if (node.kind === 'group') {
      setExpandedKeys((previous) =>
        previous.includes(node.key)
          ? previous.filter((key) => key !== node.key)
          : [...previous, node.key],
      );
      return;
    }
    if (node.kind === 'page') {
      if (node.key === model.currentPageKey) {
        if (hash) history.push(pathname + search);
        window.scrollTo({ top: 0, behavior: 'auto' });
      } else history.push(node.route);
    } else {
      if (!node.id) return;
      const nextHash = '#' + encodeURIComponent(node.id);
      if (node.route !== pathname.replace(/\/$/, ''))
        history.push(node.route + nextHash);
      else if (hash !== nextHash) history.push(pathname + search + nextHash);
      else {
        const target = document.getElementById(node.id);
        if (target) {
          const offset =
            Number.parseFloat(
              window.getComputedStyle(target).scrollMarginTop,
            ) || 92;
          window.scrollTo({
            top: target.getBoundingClientRect().top + window.scrollY - offset,
            behavior: 'auto',
          });
        }
      }
    }
    onNavigate?.();
  };
  return (
    <nav
      ref={navigationRef}
      className="filumo-doc-navigation"
      aria-label={locale === 'zh-CN' ? '文档目录' : 'Documentation'}
    >
      <Tree
        showLine
        blockNode
        virtual={false}
        treeData={model.nodes}
        expandedKeys={expandedKeys}
        selectedKeys={[visibleSelectedKey]}
        autoExpandParent={false}
        onExpand={(keys) => setExpandedKeys(keys.map(String))}
        onSelect={(_, info) => {
          const node = model.byKey.get(String(info.node.key));
          if (node) activate(node);
        }}
      />
    </nav>
  );
}
