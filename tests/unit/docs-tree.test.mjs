import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';

const result = await build({
  entryPoints: ['apps/docs/src/components/documentation-tree.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const {
  buildDocumentationTree,
  getDocumentationAncestors,
  getDocumentationHeading,
  getVisibleDocumentationKey,
} = await import(
  'data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')
);

const pages = [
  { route: '/docs', title: '概览', href: '/preview/docs' },
  {
    route: '/docs/guides/packages',
    title: '包总览',
    href: '/preview/docs/guides/packages',
  },
];
const headings = [
  { id: 'ignored', title: '页面标题', depth: 1 },
  { id: 'start', title: '接入', depth: 2 },
  { id: 'react', title: 'React', depth: 3 },
  { id: 'details', title: '不显示的四级标题', depth: 4 },
  { id: 'vue', title: 'Vue', depth: 3 },
  { id: 'api', title: '接口', depth: 2 },
];

test('文档与章节合成一棵树，三级标题挂在对应二级标题下面', () => {
  const model = buildDocumentationTree(pages, '/docs/', headings);
  assert.equal(model.nodes.length, 2);
  assert.equal(model.nodes[0].key, 'page:/docs');
  assert.deepEqual(
    model.nodes[0].children.map((n) => n.id),
    ['start', 'api'],
  );
  assert.deepEqual(
    model.nodes[0].children[0].children.map((n) => n.id),
    ['react', 'vue'],
  );
  assert.equal(model.nodes[1].children, undefined);
  assert.equal(model.byKey.get('page:/docs#react').href, '/preview/docs#react');
  assert.deepEqual(getDocumentationAncestors(model, 'page:/docs#react'), [
    'page:/docs',
    'page:/docs#start',
  ]);
});

test('缺少二级标题时三级标题归当前页，锚点编码及非法哈希均安全处理', () => {
  const model = buildDocumentationTree(pages, '/docs', [
    { id: '中文 标题', title: '中文', depth: 3 },
    { id: 'child', title: '子项', depth: 3 },
  ]);
  assert.equal(model.nodes[0].children[0].depth, 1);
  assert.equal(model.nodes[0].children[1].depth, 1);
  assert.equal(
    model.nodes[0].children[0].href,
    '/preview/docs#' + encodeURIComponent('中文 标题'),
  );
  assert.equal(
    getDocumentationHeading(model, '#' + encodeURIComponent('中文 标题')),
    'page:/docs#' + encodeURIComponent('中文 标题'),
  );
  assert.equal(getDocumentationHeading(model, '#%broken'), undefined);
  assert.equal(getDocumentationHeading(model, '#missing'), undefined);
});

test('无章节的文档仍保留页面导航，其他页面不复用当前页章节', () => {
  const model = buildDocumentationTree(pages, '/docs/guides/packages', []);
  assert.equal(model.currentPageKey, 'page:/docs/guides/packages');
  assert.equal(model.nodes.length, 2);
  assert.ok(model.nodes.every((n) => n.children === undefined));
});

test('收起祖先时只切换可见选中项，恢复展开后仍能定位原章节', () => {
  const model = buildDocumentationTree(pages, '/docs', headings);
  const active = 'page:/docs#react';
  assert.equal(
    getVisibleDocumentationKey(model, active, [
      'page:/docs',
      'page:/docs#start',
    ]),
    active,
  );
  assert.equal(
    getVisibleDocumentationKey(model, active, ['page:/docs']),
    'page:/docs#start',
  );
  assert.equal(getVisibleDocumentationKey(model, active, []), 'page:/docs');
  assert.equal(
    getVisibleDocumentationKey(model, active, [
      'page:/docs',
      'page:/docs#start',
    ]),
    active,
  );
});

test('各文档挂载自己的章节，同名锚点按页面区分，正文跟踪仅包含当前文档', () => {
  const cataloguePages = [
    { ...pages[0], headings: [{ id: 'shared', title: '首页章节', depth: 2 }] },
    {
      ...pages[1],
      headings: [
        { id: 'shared', title: '包总览章节', depth: 2 },
        { id: 'details', title: '包详情', depth: 3 },
      ],
    },
  ];
  const model = buildDocumentationTree(
    cataloguePages,
    '/docs',
    cataloguePages[0].headings,
  );
  assert.equal(model.nodes[0].children[0].title, '首页章节');
  assert.equal(model.nodes[1].children[0].title, '包总览章节');
  assert.equal(model.nodes[1].children[0].children[0].title, '包详情');
  assert.equal(
    model.byKey.get('page:/docs/guides/packages#shared').route,
    '/docs/guides/packages',
  );
  assert.equal(
    model.byKey.get('page:/docs/guides/packages#shared').href,
    '/preview/docs/guides/packages#shared',
  );
  assert.deepEqual(
    model.headings.map((node) => node.key),
    ['page:/docs#shared'],
  );
  assert.deepEqual(
    getDocumentationAncestors(model, 'page:/docs/guides/packages#details'),
    ['page:/docs/guides/packages', 'page:/docs/guides/packages#shared'],
  );
});

test('切换当前文档只改变正文跟踪来源，各一级文档的子树仍保留', () => {
  const cataloguePages = pages.map((page, index) => ({
    ...page,
    headings: [{ id: 'chapter-' + index, title: '章节 ' + index, depth: 2 }],
  }));
  const model = buildDocumentationTree(
    cataloguePages,
    '/docs/guides/packages',
    cataloguePages[1].headings,
  );
  assert.ok(model.nodes.every((node) => node.children?.length === 1));
  assert.deepEqual(
    model.headings.map((node) => node.id),
    ['chapter-1'],
  );
});
