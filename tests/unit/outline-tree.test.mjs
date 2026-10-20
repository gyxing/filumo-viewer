import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const result = await build({
  stdin: {
    contents:
      'export * from "./packages/dom/src/outline/treeRows.ts"; export * from "./packages/markdown/src/view/outlineTree.ts";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { buildOutlineRows, buildMarkdownOutlineTree } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')
);
const node = (id, level, children = []) => ({
  id,
  key: id,
  text: id,
  level,
  targetBlockId: id,
  isLeaf: !children.length,
  children,
});
const accessors = {
  getId: (node) => node.id,
  getText: (node) => node.text,
  isLeaf: (node) => node.isLeaf,
  getChildren: (node) => node.children,
};
const snapshot = (roots, expanded = []) => ({
  roots,
  expanded: new Set(expanded),
  loading: new Set(),
  revision: 1,
});
test('树缩进使用实际父子深度，连接线记录祖先和末节点', () => {
  const roots = [
    node('a', 2, [node('b', 5, [node('c', 8)]), node('d', 5)]),
    node('e', 2),
  ];
  const rows = buildOutlineRows(snapshot(roots, ['a', 'b']), accessors);
  assert.deepEqual(
    rows.map((r) => [r.node.id, r.depth]),
    [
      ['a', 0],
      ['b', 1],
      ['c', 2],
      ['d', 1],
      ['e', 0],
    ],
  );
  assert.equal(rows[1].hasNextSibling, true);
  assert.deepEqual(rows[2].ancestorHasNextSibling, [true, true]);
  assert.equal(rows[3].hasNextSibling, false);
  assert.equal(rows[2].parentId, 'b');
});
test('收起隐藏子树，懒取子级优先于旧节点缓存', () => {
  const a = node('a', 0, [node('old', 1)]);
  const cached = { ...accessors, getChildren: () => [node('new', 4)] };
  assert.deepEqual(
    buildOutlineRows(snapshot([a]), cached).map((r) => r.node.id),
    ['a'],
  );
  assert.deepEqual(
    buildOutlineRows(snapshot([a], ['a']), cached).map((r) => r.node.id),
    ['a', 'new'],
  );
});

test('Markdown 跳级标题按实际父子关系缩进，相同级别回到同一层', () => {
  const headings = [
    { id: 'a', title: '二级起始', depth: 2 },
    { id: 'b', title: '跳至四级', depth: 4 },
    { id: 'c', title: '五级子项', depth: 5 },
    { id: 'd', title: '另一个四级', depth: 4 },
    { id: 'e', title: '另一个根节点', depth: 2 },
  ];
  const { roots } = buildMarkdownOutlineTree(headings);
  const markdownAccessors = {
    getId: (node) => node.heading.id,
    getText: (node) => node.heading.title,
    isLeaf: (node) => !node.children.length,
    getChildren: (node) => node.children,
  };
  const rows = buildOutlineRows(snapshot(roots, ['a', 'b']), markdownAccessors);
  assert.deepEqual(
    rows.map((row) => [row.node.heading.id, row.depth]),
    [
      ['a', 0],
      ['b', 1],
      ['c', 2],
      ['d', 1],
      ['e', 0],
    ],
  );
  assert.deepEqual(rows[2].ancestorHasNextSibling, [true, true]);
  assert.equal(rows[3].hasNextSibling, false);
  assert.equal(rows[2].node.parentId, 'b');
  assert.deepEqual(
    buildOutlineRows(snapshot(roots, ['b']), markdownAccessors).map(
      (row) => row.node.heading.id,
    ),
    ['a', 'e'],
  );
});

test('未知子级保留分支语义，同名节点和深层树不依赖递归调用栈', () => {
  const pending = { id: 'pending', text: '相同标题', isLeaf: false };
  const rows = buildOutlineRows(
    snapshot([pending, node('other', 0)]),
    accessors,
  );
  assert.equal(rows[0].isLeaf, false);
  assert.equal(rows.length, 2);
  const root = node('0', 0),
    expanded = [];
  let current = root;
  for (let index = 1; index < 3000; index++) {
    expanded.push(current.id);
    current.isLeaf = false;
    current.children = [node(String(index), index)];
    current = current.children[0];
  }
  assert.equal(
    buildOutlineRows(snapshot([root], expanded), accessors).length,
    3000,
  );
});
