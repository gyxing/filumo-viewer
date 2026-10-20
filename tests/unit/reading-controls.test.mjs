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
    export {MarkdownImage} from './packages/markdown/src/view/MarkdownImage';
    export {TextFindBar} from './packages/text/src/view/TextFindBar';
    export {actionMenuItem} from './packages/dom/src/shell/toolbarMenuItems';`,
    resolveDir: resolve('.'),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  loader: { '.less': 'empty' },
  alias: { '@fivo/dom/outline': resolve('packages/dom/src/outline.ts') },
});
const {
  JsonTree, scanJson, TextViewport, readText, MarkdownOutline, MarkdownImage, TextFindBar, actionMenuItem,
} = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

test('编码重试按命令执行，已检测编码仍可手动指定，其他选择项保留原语义', async () => {
  const calls = [];
  const action = {
    id: 'custom.charset', label: '编码', kind: 'select', value: 'utf-8', allowReselect: true,
    options: [{ value: 'utf-8', label: 'UTF-8' }, { value: 'auto', label: '重新自动识别', kind: 'action', dividerBefore: true }],
    run: (value) => { calls.push(value); },
  };
  const item = actionMenuItem(action, true);
  assert.equal(item.value, 'UTF-8');
  const [utf8, retry] = item.children;
  assert.equal(utf8.kind, 'radio');
  assert.equal(utf8.checked, true);
  assert.equal(retry.kind, undefined);
  assert.equal(retry.checked, undefined);
  assert.equal(retry.dividerBefore, true);
  await retry.run();
  await retry.run();
  await utf8.run();
  assert.deepEqual(calls, ['auto', 'auto', 'utf-8']);
  const other = actionMenuItem({
    ...action, id: 'text.encoding', allowReselect: false,
    options: [{ value: 'utf-8', label: 'UTF-8' }, { value: 'auto', label: '自动' }],
  }, true);
  assert.equal(other.children[1].kind, 'radio');
  await other.children[0].run();
  assert.equal(calls.length, 3);
});

test('菜单开关与执行后关闭由声明决定，不再依赖动作 ID', () => {
  const action = { id: 'custom.search', kind: 'toggle', label: '查找', pressed: true, run() {} };
  assert.equal(actionMenuItem(action, true).kind, 'checkbox');
  const command = actionMenuItem({ ...action, menu: { kind: 'action' } }, true);
  assert.equal(command.kind, undefined);
  assert.equal(command.checked, undefined);
  assert.equal(actionMenuItem({ ...action, menu: { closeOnRun: true } }, true).closeOnRun, true);
});

test('第一级操作均提供图标，子菜单选项不添加操作图标', () => {
  const expected = {
    'text.encoding': 'encoding', 'text.search': 'search',
    'text.wrap': 'wrap', 'text.lines': 'lines',
    'json.mode': 'view', 'json.branch': 'branch', 'json.path': 'path',
    'markdown.outline': 'outline', 'office.revision': 'review',
    'office.review': 'review', 'office.sheetMode': 'view',
    'office.sheet': 'sheet', 'office.zoomMode': 'view',
    'office.notes': 'notes', 'office.transitions': 'transitions',
    'custom.operation': 'command',
  };
  for (const [id, icon] of Object.entries(expected)) {
    const action = { id, label: id, kind: 'action', run() {} };
    assert.equal(actionMenuItem(action, true).icon, icon, id);
  }
  const select = actionMenuItem({
    id: 'text.encoding', label: '编码', kind: 'select',
    options: [{ value: 'utf-8', label: 'UTF-8' }], run() {},
  }, true);
  assert.equal(select.children[0].icon, undefined);
});

test('查找控件动态更新语言时保留查询、焦点和开关状态', () => {
  const document = createDocument();
  const bar = new TextFindBar(document, false, () => {}, () => {}, () => {});
  bar.query.value = '中文';
  bar.query.focus();
  bar.matchCase.checked = true;
  bar.wholeWord.checked = true;
  bar.updateLocale(true);
  assert.equal(bar.query.value, '中文');
  assert.equal(document.activeElement, bar.query);
  assert.equal(bar.query.getAttribute('aria-label'), 'Find text');
  assert.equal(bar.element.children[1].textContent, 'Previous');
  assert.equal(bar.element.children[2].textContent, 'Next');
  assert.equal(bar.element.children[3].children[1].data, 'Case');
  assert.equal(bar.element.children[4].children[1].data, 'Whole word');
  assert.equal(bar.element.children[6].textContent, 'Close');
  assert.equal(bar.matchCase.checked, true);
  assert.equal(bar.wholeWord.checked, true);
  bar.updateLocale(false);
  assert.equal(bar.query.placeholder, '查找文本');
});

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
  const canvas = outline.element.querySelector('.fivo-outline-canvas');
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
  const list = outline.element.querySelector('.fivo-outline-tree'),
    canvas = outline.element.querySelector('.fivo-outline-canvas');
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
