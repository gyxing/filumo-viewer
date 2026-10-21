import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { createDocument } from './helpers/reading-dom.mjs';

// 使用真实工作区并替换两个视图端口，观察动态模块与迟到解析的挂载边界。
const compiled = await build({
  stdin: {
    resolveDir: resolve('.'),
    contents: `export {JsonWorkspace} from './packages/json/src/view/JsonWorkspace'; export {JsonSplitHandle} from './packages/json/src/view/JsonSplitHandle'; export {events,hooks} from 'test:events';`,
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  loader: { '.less': 'empty' },
  plugins: [
    {
      name: 'view-ports',
      setup(builder) {
        builder.onResolve({ filter: /^test:events$/ }, () => ({
          path: 'state',
          namespace: 'test-state',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'test-state' }, () => ({
          contents: 'export const events=[]; export const hooks={};',
          loader: 'js',
        }));
        builder.onResolve({ filter: /^\.\/Json(?:Source|Tree)$/ }, (args) =>
          args.importer.endsWith('JsonWorkspace.ts')
            ? { path: args.path, namespace: 'test-view' }
            : undefined,
        );
        builder.onLoad({ filter: /.*/, namespace: 'test-view' }, (args) => {
          const source = args.path.endsWith('Source'),
            name = source ? 'JsonSource' : 'JsonTree';
          return {
            loader: 'js',
            contents: `import {events,hooks} from 'test:events'; events.push('load-${name}');
        export class ${name} { constructor(host,model,document,depth,zoom,en,onChange,onReveal) { events.push('mount-${name}');
          ${
            source
              ? 'this.element=host.ownerDocument.createElement("div"); host.append(this.element);'
              : 'this.element=document.createElement("div"); hooks.reveal=onReveal; hooks.change=onChange;'
          } }
          getPosition(){return {top:40,left:0,line:1}} restorePosition(value){events.push(['restore',value.top])}
          getState(){return {expanded:['0'],selected:'0',top:40}} restoreState(value){events.push(['restore-tree',value.top])}
          getBranchState(){return {canToggle:true,expanded:true}} getPath(){return '/key'} toggleSelected(){} setZoom(){} update(){} setActive(){} showSearch(){}
          revealRange(value){events.push(['reveal',value.start])} dispose(){events.push('dispose-${name}');this.element.remove()}
        }`,
          };
        });
      },
    },
  ],
});
const { JsonWorkspace, JsonSplitHandle, events, hooks } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(compiled.outputFiles[0].text).toString('base64')
);
const settle = () =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });
function fixture(width, mode, parse) {
  events.length = 0;
  const document = createDocument(),
    host = document.createElement('div');
  // 只补充动态尺寸写入；真实布局仍由浏览器验收。
  const createElement = document.createElement;
  document.createElement = (...args) => {
    const element = createElement(...args);
    element.style.setProperty = (name, value) => {
      element.style[name] = value;
    };
    return element;
  };
  host.clientWidth = width;
  const controller = new AbortController();
  const session = {
    mode,
    options: {},
    content: {
      revision: 1,
      document: {
        text: '{}',
        lineStarts: Uint32Array.of(0),
        encoding: 'utf-8',
        newline: 'none',
      },
    },
    ensureParsed: parse,
  };
  const workspace = new JsonWorkspace(
    host,
    session,
    {
      container: host,
      session: { signal: controller.signal },
      options: {},
      onError(error) {
        throw error;
      },
    },
    () => {},
  );
  return { workspace, host, controller, session };
}
const ready = () =>
  Promise.resolve({ kind: 'ready', document: { diagnostics: [] } });

test('重复属性提示合并到结构标题，切换语言和区域后仍正确显示', async () => {
  const diagnostic = {
    message: '重复属性：key',
    severity: 'warning',
    offset: 10,
    line: 1,
    column: 11,
  };
  const f = fixture(1000, 'tree', () =>
    Promise.resolve({
      kind: 'ready',
      document: {
        diagnostics: [
          diagnostic,
          { ...diagnostic, message: '重复属性：other', offset: 20, column: 21 },
        ],
      },
    }),
  );
  await f.workspace.initialize();
  const title = f.host
    .querySelector('.filumo-json-pane--tree')
    .querySelector('.filumo-json-pane-header').children[0];
  assert.equal(title.textContent, '结构（已保留 2 个重复属性）');
  assert.ok(title.title.includes(diagnostic.message));
  f.workspace.setMode('source');
  await settle();
  f.workspace.setMode('tree');
  await settle();
  assert.equal(title.textContent, '结构（已保留 2 个重复属性）');
  f.workspace.update({ locale: 'en-US' }, 100);
  await settle();
  assert.equal(title.textContent, 'Structure (2 duplicate keys preserved)');
  f.workspace.dispose();
  const clean = fixture(1000, 'tree', ready);
  await clean.workspace.initialize();
  const cleanTitle = clean.host
    .querySelector('.filumo-json-pane--tree')
    .querySelector('.filumo-json-pane-header').children[0];
  assert.equal(cleanTitle.textContent, '结构');
  assert.equal(cleanTitle.title, '');
  clean.workspace.dispose();
});

test('初始原文不加载结构端口，宽窄切换不提前挂载隐藏代码区', async () => {
  let parsed = 0;
  const f = fixture(1000, 'source', () => {
    parsed++;
    return ready();
  });
  await f.workspace.initialize();
  assert.equal(parsed, 0);
  assert.equal(events.includes('load-JsonTree'), false);
  f.workspace.setMode('tree');
  await settle();
  assert.equal(f.workspace.getState().treeReady, true);
  f.host.clientWidth = 600;
  await f.workspace.initialize();
  assert.equal(f.workspace.getState().sourceReady, false);
  assert.ok(events.includes('dispose-JsonSource'));
  const sourceMounts = events.filter(
    (event) => event === 'mount-JsonSource',
  ).length;
  hooks.reveal({ start: 1, end: 2 });
  assert.equal(
    events.filter((event) => event === 'mount-JsonSource').length,
    sourceMounts,
  );
  f.workspace.setMode('source');
  await settle();
  assert.ok(
    events.some(
      (event) =>
        Array.isArray(event) && event[0] === 'reveal' && event[1] === 1,
    ),
  );
  f.workspace.dispose();
});

test('隐藏结构后迟到的解析不挂载旧树，销毁后不创建新区域', async () => {
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const f = fixture(1000, 'tree', () => pending);
  const opening = f.workspace.initialize();
  await settle();
  f.workspace.setMode('source');
  finish({ kind: 'ready', document: {} });
  await opening;
  await settle();
  assert.equal(events.includes('mount-JsonTree'), false);
  assert.equal(f.workspace.getState().sourceReady, true);
  f.workspace.dispose();
  const count = events.length;
  f.workspace.setMode('tree');
  await settle();
  assert.equal(events.length, count);
});

test('初始窄屏结构失败后才加载原文，并显示诊断', async () => {
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const f = fixture(600, 'tree', () => pending);
  const opening = f.workspace.initialize();
  await settle();
  assert.equal(events.includes('mount-JsonSource'), false);
  finish({
    kind: 'invalid',
    diagnostics: [{ message: '错误', line: 1, column: 2, offset: 1 }],
  });
  await opening;
  await settle();
  assert.equal(f.workspace.getState().sourceReady, true);
  assert.equal(f.workspace.getState().treeReady, false);
  assert.equal(
    f.host.querySelector('.filumo-json-workspace-notice').hidden,
    false,
  );
  f.workspace.dispose();
});

function splitFixture(width = 1000) {
  const document = createDocument(),
    frames = new Map(),
    listeners = new Map();
  let sequence = 0;
  document.defaultView = {
    requestAnimationFrame(callback) {
      frames.set(++sequence, callback);
      return sequence;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };
  const panes = document.createElement('div'),
    source = document.createElement('section');
  panes.style.setProperty = (name, value) => {
    panes.style[name] = value;
  };
  const split = new JsonSplitHandle(panes, source),
    handle = split.element,
    captures = new Set();
  handle.setPointerCapture = (id) => captures.add(id);
  handle.hasPointerCapture = (id) => captures.has(id);
  handle.releasePointerCapture = (id) => captures.delete(id);
  split.update(width, true, false);
  return {
    split,
    handle,
    panes,
    captures,
    frames,
    listeners,
    right: () => Number.parseFloat(panes.style['--filumo-json-tree-width']),
    emit(type, values = {}) {
      const event = {
        pointerId: 7,
        button: 0,
        isPrimary: true,
        clientX: 600,
        preventDefault() {},
        ...values,
      };
      handle.listeners.get(type)?.(event);
    },
    flush() {
      for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback();
      }
    },
  };
}

test('默认平分两栏，拖动按帧更新并遵守两栏最小宽度', () => {
  const f = splitFixture();
  const initialRight = f.right();
  assert.equal(initialRight, (1000 - 6) / 2);
  f.emit('pointerdown');
  assert.equal(f.captures.has(7), true);
  f.emit('pointermove', { clientX: 350 });
  assert.equal(f.right(), initialRight);
  assert.equal(f.frames.size, 1);
  f.flush();
  assert.ok(f.right() > initialRight);
  f.emit('pointermove', { clientX: -5000 });
  f.flush();
  assert.ok(Math.abs(f.right() - (1000 - 6 - 280)) < 0.01);
  f.emit('pointerup', { clientX: 5000 });
  assert.ok(Math.abs(f.right() - 240) < 0.01);
  assert.equal(f.captures.size, 0);
  assert.equal(f.frames.size, 0);
  assert.equal(f.panes.dataset.resizing, undefined);
  f.split.dispose();
});

test('手动比例随容器变化保留，双击后恢复默认布局', () => {
  const f = splitFixture();
  f.emit('keydown', { key: 'Home' });
  const ratio = f.right() / 994;
  f.split.update(1600, true, true);
  assert.ok(Math.abs(f.right() / 1594 - ratio) < 0.001);
  f.emit('dblclick');
  assert.equal(f.right(), (1600 - 6) / 2);
  f.split.update(1000, true, false);
  assert.equal(f.right(), (1000 - 6) / 2);
  f.split.dispose();
});

test('只点击分隔条保留默认自适应，窗口失焦释放捕获和排队更新', () => {
  const f = splitFixture();
  f.emit('pointerdown');
  f.emit('pointerup');
  f.split.update(1600, true, false);
  assert.equal(f.right(), (1600 - 6) / 2);
  f.emit('pointerdown');
  f.emit('pointermove', { clientX: 500 });
  f.listeners.get('blur')();
  assert.equal(f.captures.size, 0);
  assert.equal(f.frames.size, 0);
  assert.equal(f.listeners.has('blur'), false);
  assert.equal(f.panes.dataset.resizing, undefined);
  f.split.dispose();
});

test('键盘调整更新可访问状态，隐藏、取消和销毁会结束拖动', () => {
  const f = splitFixture();
  assert.equal(f.handle.getAttribute('role'), 'separator');
  assert.equal(f.handle.getAttribute('aria-orientation'), 'vertical');
  f.emit('keydown', { key: 'Home' });
  f.emit('keydown', { key: 'ArrowRight', shiftKey: true });
  assert.ok(Math.abs(f.right() - (994 - 330)) < 0.01);
  f.emit('keydown', { key: 'End' });
  assert.ok(Math.abs(f.right() - 240) < 0.01);
  assert.equal(
    f.handle.getAttribute('aria-valuenow'),
    f.handle.getAttribute('aria-valuemax'),
  );
  f.emit('pointerdown');
  f.emit('pointermove', { clientX: 500 });
  f.emit('pointercancel');
  assert.equal(f.captures.size, 0);
  assert.equal(f.listeners.has('blur'), false);
  f.emit('pointerdown');
  f.emit('pointermove', { clientX: 400 });
  f.split.update(600, false, false);
  assert.equal(f.handle.hidden, true);
  assert.equal(f.frames.size, 0);
  assert.equal(f.captures.size, 0);
  f.split.update(1000, true, false);
  f.emit('pointerdown');
  f.emit('pointermove', { clientX: 300 });
  f.split.dispose();
  assert.equal(f.frames.size, 0);
  assert.equal(f.captures.size, 0);
  assert.equal(f.handle.listeners.size, 0);
});

test('工作区切换区域和窄屏时保留手动比例，调整宽度不重建视图', async () => {
  let parsed = 0;
  const f = fixture(1000, 'tree', () => {
    parsed++;
    return ready();
  });
  await f.workspace.initialize();
  const handle = f.host.querySelector('.filumo-json-split-handle'),
    panes = f.host.querySelector('.filumo-json-panes');
  handle.listeners.get('keydown')({ key: 'Home', preventDefault() {} });
  const width = panes.style['--filumo-json-tree-width'];
  assert.equal(events.filter((event) => event === 'mount-JsonSource').length, 1);
  assert.equal(events.filter((event) => event === 'mount-JsonTree').length, 1);
  assert.equal(parsed, 1);
  f.workspace.setMode('source');
  await settle();
  assert.equal(handle.hidden, true);
  f.workspace.setMode('tree');
  await settle();
  assert.equal(handle.hidden, false);
  assert.equal(panes.style['--filumo-json-tree-width'], width);
  f.host.clientWidth = 600;
  await f.workspace.initialize();
  assert.equal(handle.hidden, true);
  f.host.clientWidth = 1000;
  await f.workspace.initialize();
  assert.equal(handle.hidden, false);
  assert.equal(panes.style['--filumo-json-tree-width'], width);
  f.workspace.dispose();
});
