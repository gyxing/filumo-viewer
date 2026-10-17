import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { createDocument } from './helpers/reading-dom.mjs';

const bundle = await build({
  stdin: {
    contents: `export {JsonTree} from './packages/json/src/view/JsonTree';
    export {scanJson} from './packages/json/src/parser/scanJson';
    export {TextViewport} from './packages/text/src/view/TextViewport';
    export {readText} from './packages/text/src/reader/decodeText';
    export {MarkdownOutline} from './packages/markdown/src/view/MarkdownOutline';
    export {MarkdownImage} from './packages/markdown/src/view/MarkdownImage';`,
    resolveDir: resolve('.'),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  loader: { '.less': 'empty' },
});
const {
  JsonTree, scanJson, TextViewport, readText, MarkdownOutline, MarkdownImage,
} = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

test('合并分支操作同步选中状态，收起再展开保留其他分支与子分支', async () => {
  const source = '{"a":{"child":{"value":1}},"b":[2],"empty":{},"leaf":3}';
  const signal = new AbortController().signal;
  const model = (
    await scanJson(source, { maxDepth: 256, maxNodes: 100 }, signal)
  ).document;
  const text = (await readText(new TextEncoder().encode(source), { signal }))
    .document;
  let changes = 0;
  const tree = new JsonTree(
    model,
    text,
    createDocument(),
    3,
    100,
    false,
    () => {
      changes++;
    },
  );
  assert.deepEqual(tree.getBranchState(), { canToggle: true, expanded: true });
  const original = tree.getState().expanded;
  tree.toggleSelected();
  assert.equal(tree.getBranchState().expanded, false);
  tree.toggleSelected();
  assert.deepEqual(new Set(tree.getState().expanded), new Set(original));
  const property = (key) =>
    model.nodes.find((node) => node.type === 'property' && node.key === key)
      .childIds[0];
  const a = property('a'),
    b = property('b');
  tree.element
    .querySelector(`[data-node-id="${a}"]`)
    .onclick({ target: undefined });
  const before = changes;
  tree.toggleSelected();
  assert.equal(tree.getBranchState().expanded, false);
  assert.ok(tree.getState().expanded.includes(b));
  assert.ok(changes > before);
  tree.toggleSelected();
  assert.equal(tree.getBranchState().expanded, true);
  for (const key of ['empty', 'leaf']) {
    tree.element
      .querySelector(`[data-node-id="${property(key)}"]`)
      .onclick({ target: undefined });
    assert.deepEqual(tree.getBranchState(), {
      canToggle: false,
      expanded: false,
    });
    const state = tree.getState();
    tree.toggleSelected();
    assert.deepEqual(tree.getState(), state);
  }
  const scroll = tree.element.querySelector('.fivo-json-scroll');
  const beforeKey = changes;
  scroll.onkeydown({ key: 'Home', preventDefault() {} });
  assert.equal(tree.getState().selected, model.rootId);
  assert.ok(changes > beforeKey);
  scroll.onkeydown({ key: 'ArrowLeft', preventDefault() {} });
  assert.equal(tree.getBranchState().expanded, false);
  tree.dispose();
});

test('共享原文视图默认隐藏行号，显式开启及更新可恢复', async () => {
  const signal = new AbortController().signal;
  const model = (
    await readText(new TextEncoder().encode('one\ntwo'), { signal })
  ).document;
  const viewport = new TextViewport(model, {}, createDocument());
  const number = () => viewport.element.querySelector('.fivo-text-line-number');
  assert.equal(number().hidden, true);
  viewport.update(model, { lineNumbers: true });
  assert.equal(number().hidden, false);
  viewport.update(model, {});
  assert.equal(number().hidden, true);
  viewport.dispose();
});

test('Markdown 大纲折叠不跳正文，键盘导航与当前章节分别同步', () => {
  const document = createDocument(),
    navigated = [];
  const outline = new MarkdownOutline(
    document,
    [
      { id: 'a', title: '父标题', depth: 2 },
      { id: 'b', title: '子标题', depth: 4 },
      { id: 'c', title: '孙标题', depth: 5 },
      { id: 'd', title: '其他标题', depth: 2 },
    ],
    (id) => navigated.push(id),
    false,
    () => outline.setOpen(false),
  );
  const canvas = outline.element.querySelector('.fivo-markdown-outline-canvas');
  const row = (id) =>
    canvas.children.find((item) => item.dataset.outlineId === id);
  const key = (id, value) =>
    row(id).onkeydown({
      key: value, preventDefault() {}, stopPropagation() {},
    });
  assert.equal(row('a').style.paddingLeft, '0px');
  assert.equal(row('b').style.paddingLeft, '16px');
  assert.equal(
    outline.element.querySelector('.fivo-markdown-outline-count').textContent,
    '4',
  );
  key('a', 'ArrowLeft');
  assert.equal(row('b'), undefined);
  assert.deepEqual(navigated, []);
  key('a', 'ArrowRight');
  assert.ok(row('c'));
  key('a', 'ArrowDown');
  assert.equal(document.activeElement.dataset.outlineId, 'b');
  key('b', 'Enter');
  assert.deepEqual(navigated, ['b']);
  assert.equal(row('b').getAttribute('aria-selected'), 'true');
  outline.setCurrent('d');
  assert.equal(row('d').getAttribute('aria-selected'), 'true');
  assert.deepEqual(navigated, ['b']);
  outline.element.querySelector('.fivo-markdown-outline-close').onclick();
  assert.equal(outline.element.hidden, true);
  outline.setOpen(true);
  assert.equal(outline.element.hidden, false);
  outline.dispose();
});

test('Markdown 长大纲仅生成窗口内节点，同步远处章节后仍有键盘入口', () => {
  const document = createDocument();
  const headings = Array.from({ length: 300 }, (_, index) => ({
    id: String(index),
    title: '标题 ' + index,
    depth: 2,
  }));
  const outline = new MarkdownOutline(
    document, headings, () => {}, false, () => {},
  );
  const list = outline.element.querySelector('.fivo-markdown-outline-list'),
    canvas = outline.element.querySelector('.fivo-markdown-outline-canvas');
  assert.ok(canvas.children.length < 40);
  outline.setCurrent('249');
  assert.ok(list.scrollTop > 0);
  const selected = canvas.children.find(
    (item) => item.dataset.outlineId === '249',
  );
  assert.equal(selected.getAttribute('aria-selected'), 'true');
  assert.equal(selected.tabIndex, 0);
  assert.ok(canvas.children.length < 40);
  outline.dispose();
});

test('Markdown 图片的迟到状态通过阅读生命周期呈现，失败不留下空白', () => {
  const pending = [];
  const image = new MarkdownImage(
    createDocument(), 'example.png', '示意图', '', false,
    (update) => pending.push(update),
  );
  image.load('blob:example');
  image.element.onload();
  assert.equal(image.element.hidden, true);
  pending.shift()();
  assert.equal(image.element.hidden, false);
  assert.equal(image.container.dataset.state, 'ready');
  image.element.onerror();
  pending.shift()();
  assert.equal(image.element.hidden, true);
  assert.equal(image.container.dataset.state, 'unavailable');
  assert.equal(
    image.container.querySelector('.fivo-markdown-image-status').textContent,
    '图片不可用：示意图',
  );
  image.dispose();
  assert.equal(image.element.onload, null);
  assert.equal(image.element.onerror, null);
});
