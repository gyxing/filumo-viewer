/** 文档可展示的章节；沿用 Dumi 的二、三级标题范围。 */
export interface DocumentationHeading {
  id: string;
  title: string;
  depth: number;
}

export interface DocumentationPage {
  route: string;
  href: string;
  title: string;
  headings?: readonly DocumentationHeading[];
}

export interface DocumentationTreeNode extends DocumentationPage {
  key: string;
  kind: 'page' | 'heading';
  depth: number;
  id?: string;
  children?: DocumentationTreeNode[];
}

export interface DocumentationTreeModel {
  nodes: DocumentationTreeNode[];
  byKey: Map<string, DocumentationTreeNode>;
  parents: Map<string, string>;
  headings: DocumentationTreeNode[];
  currentPageKey: string;
}

/** 合并各文档自己的章节，正文滚动跟踪仅使用当前页的标题。 */
export function buildDocumentationTree(
  pages: readonly DocumentationPage[],
  pathname: string,
  headings: readonly DocumentationHeading[],
): DocumentationTreeModel {
  const currentRoute = pathname.replace(/\/$/, '') || '/';
  const nodes: DocumentationTreeNode[] = pages.map((page) => ({
    ...page,
    key: 'page:' + page.route,
    kind: 'page',
    depth: 0,
  }));
  const model: DocumentationTreeModel = {
    nodes,
    byKey: new Map(nodes.map((node) => [node.key, node])),
    parents: new Map(),
    headings: [],
    currentPageKey: 'page:' + currentRoute,
  };
  for (const page of nodes) {
    const source =
      page.key === model.currentPageKey ? headings : page.headings ?? [];
    let section: DocumentationTreeNode | undefined;
    for (const item of source) {
      if (item.depth < 2 || item.depth > 3) continue;
      const key = page.key + '#' + encodeURIComponent(item.id);
      if (model.byKey.has(key)) continue;
      // 每个文档单独维护层级，同名锚点通过页面路径隔离。
      const parent = item.depth === 3 && section ? section : page;
      const node: DocumentationTreeNode = {
        key,
        kind: 'heading',
        title: item.title,
        id: item.id,
        depth: parent.depth + 1,
        route: page.route,
        href: page.href + '#' + encodeURIComponent(item.id),
      };
      (parent.children ??= []).push(node);
      model.byKey.set(key, node);
      model.parents.set(key, parent.key);
      if (page.key === model.currentPageKey) model.headings.push(node);
      if (item.depth === 2) section = node;
    }
  }
  return model;
}

/** 返回从页面到直接父级的路径，仅用于显式导航时展开祖先。 */
export function getDocumentationAncestors(
  model: DocumentationTreeModel,
  key: string,
): string[] {
  const result: string[] = [];
  let parent = model.parents.get(key);
  while (parent) {
    result.unshift(parent);
    parent = model.parents.get(parent);
  }
  return result;
}

/** 将合法且实际存在的哈希映射到树节点，非法编码不影响页面。 */
export function getDocumentationHeading(
  model: DocumentationTreeModel,
  hash: string,
): string | undefined {
  if (!hash.startsWith('#')) return undefined;
  try {
    const key =
      model.currentPageKey +
      '#' +
      encodeURIComponent(decodeURIComponent(hash.slice(1)));
    return model.byKey.get(key)?.kind === 'heading' ? key : undefined;
  } catch {
    return undefined;
  }
}

/** 分支收起时选中最近可见祖先，保留实际阅读章节供再次展开恢复。 */
export function getVisibleDocumentationKey(
  model: DocumentationTreeModel,
  key: string,
  expandedKeys: readonly string[],
): string {
  const expanded = new Set(expandedKeys);
  const candidates = [key, ...getDocumentationAncestors(model, key).reverse()];
  return (
    candidates.find((candidate) =>
      getDocumentationAncestors(model, candidate).every((parent) =>
        expanded.has(parent),
      ),
    ) ?? model.currentPageKey
  );
}
