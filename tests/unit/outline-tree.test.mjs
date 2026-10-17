import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const result = await build({
  stdin: {
    contents:
      'export * from "./packages/office/src/renderers/word/support/outlineTree.ts"; export * from "./packages/markdown/src/view/outlineTree.ts";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const {
  flattenOutlineRows,
  buildMarkdownOutlineTree,
  markdownOutlineRows,
} = await import(
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
test('树缩进使用实际父子深度，连接线记录祖先和末节点', () => {
  const roots = [
    node('a', 2, [node('b', 5, [node('c', 8)]), node('d', 5)]),
    node('e', 2),
  ];
  const rows = flattenOutlineRows(roots, new Set(['a', 'b']), new Map());
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
  const children = new Map([['a', [node('new', 4)]]]);
  assert.deepEqual(
    flattenOutlineRows([a], new Set(), children).map((r) => r.node.id),
    ['a'],
  );
  assert.deepEqual(
    flattenOutlineRows([a], new Set(['a']), children).map((r) => r.node.id),
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
  const rows = markdownOutlineRows(roots, new Set(['a', 'b']));
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
    markdownOutlineRows(roots, new Set(['b'])).map((row) => row.node.heading.id),
    ['a', 'e'],
  );
});
