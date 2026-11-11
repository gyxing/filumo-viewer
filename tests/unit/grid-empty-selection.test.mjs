import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument } from './helpers/reading-dom.mjs';

const bundle = await build({
  entryPoints: ['packages/dom/src/grid/controller.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  loader: { '.less': 'empty' },
  plugins: [
    {
      name: 'style-boundary',
      setup(builder) {
        builder.onResolve({ filter: /^\.\.\/styles$/ }, () => ({
          path: 'styles',
          namespace: 'fixture',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: 'export function useStyles(){return ()=>{};}',
        }));
      },
    },
  ],
});
const { GridInteractionController } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

/** 模拟可见节点及事件，选择几何与渲染器分别由原有用例覆盖。 */
function fixture(state) {
  const document = createDocument();
  const create = document.createElement;
  const events = new Map();
  const frames = new Map();
  const writes = [];
  const changes = [];
  let frameId = 0;
  const matches = (node, selector) => {
    if (selector.startsWith('.'))
      return node.classList.contains(selector.slice(1));
    if (selector.startsWith('[')) {
      return [...selector.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)].every(
        ([, key, value]) => {
          const actual = key.startsWith('data-')
            ? node.dataset[
                key
                  .slice(5)
                  .replace(/-([a-z])/g, (_match, letter) =>
                    letter.toUpperCase(),
                  )
              ]
            : node.getAttribute(key);
          return value === undefined
            ? actual !== undefined && actual !== null
            : actual === value;
        },
      );
    }
    return node.tagName?.toLowerCase() === selector;
  };
  document.createElement = (tag = 'div') => {
    const node = create();
    node.tagName = tag.toUpperCase();
    node.querySelectorAll = (selector) => {
      const found = [];
      const visit = (parent) => {
        for (const child of parent.children) {
          if (selector.split(',').some((part) => matches(child, part.trim())))
            found.push(child);
          visit(child);
        }
      };
      visit(node);
      return found;
    };
    node.querySelector = (selector) => node.querySelectorAll(selector)[0];
    node.closest = (selector) => {
      for (let current = node; current; current = current.parentElement)
        if (selector.split(',').some((part) => matches(current, part.trim())))
          return current;
      return null;
    };
    node.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 500,
      bottom: 300,
    });
    node.clientWidth = 500;
    node.clientHeight = 300;
    return node;
  };
  document.addEventListener = (type, handler) => {
    if (!events.has(type)) events.set(type, new Set());
    events.get(type).add(handler);
  };
  document.removeEventListener = (type, handler) =>
    events.get(type)?.delete(handler);
  document.getSelection = () => ({ isCollapsed: true });
  document.createTreeWalker = () => ({ nextNode: () => null });
  document.createRange = () => ({ getClientRects: () => [] });
  document.defaultView = {
    getComputedStyle: () => ({ position: 'relative' }),
    requestAnimationFrame(callback) {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    navigator: {
      clipboard: {
        async writeText(text) {
          writes.push(text);
        },
      },
    },
  };
  const viewer = document.createElement('section');
  viewer.className = 'filumo-viewer';
  const viewport = document.createElement('div');
  viewport.className = 'filumo-viewport';
  const host = document.createElement('div');
  const cell = document.createElement('div');
  cell.dataset.gridRow = '1';
  cell.dataset.gridColumn = '0';
  host.append(cell);
  viewport.append(host);
  viewer.append(viewport);
  const adapter = {
    bounds: () => ({ startRow: 1, endRow: 10, startColumn: 0, endColumn: 4 }),
    revision: () => 1,
    hitTest: (x, y) =>
      x < 200 && y >= 20 && y < 200
        ? { row: Math.floor(y / 20), column: Math.floor(x / 50) }
        : undefined,
    rects: () => [{ left: 0, top: 20, width: 50, height: 20 }],
    reveal() {},
    async *readRows(range) {
      for (let row = range.startRow; row <= range.endRow; row++)
        yield Array.from(
          { length: range.endColumn - range.startColumn + 1 },
          () => 'value',
        );
    },
    changed(next) {
      changes.push(next);
    },
  };
  const controller = new GridInteractionController({
    host,
    adapter,
    state,
    onError(error) {
      throw error;
    },
  });
  const dispatch = (type, values = {}) => {
    const event = {
      target: host,
      button: 0,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 20,
      clientY: 30,
      key: '',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...values,
    };
    host.listeners.get(type)?.(event);
    return event;
  };
  const clickOutside = (target) => {
    for (const handler of events.get('click') ?? [])
      handler({ target, button: 0, defaultPrevented: false });
  };
  return {
    controller,
    host,
    cell,
    viewer,
    viewport,
    document,
    adapter,
    dispatch,
    clickOutside,
    writes,
    changes,
    frames,
    events,
  };
}

test('初始、重绘与重新激活保持空选择，Esc移除高亮和活动单元格', () => {
  const view = fixture();
  try {
    assert.equal(view.controller.range, undefined);
    view.controller.refresh();
    view.controller.setActive(false);
    view.controller.setActive(true);
    assert.equal(view.controller.range, undefined);
    view.controller.select({ row: 1, column: 0 });
    assert.equal(view.cell.getAttribute('aria-selected'), 'true');
    assert.ok(view.host.getAttribute('aria-activedescendant'));
    assert.equal(
      view.dispatch('keydown', { key: 'Escape' }).defaultPrevented,
      true,
    );
    view.controller.refresh();
    assert.equal(view.controller.range, undefined);
    assert.equal(view.cell.getAttribute('aria-selected'), 'false');
    assert.equal(view.host.getAttribute('aria-activedescendant'), undefined);
  } finally {
    view.controller.dispose();
  }
  assert.equal(view.events.get('click').size, 0);
});

test('空选区复制交还浏览器，Tab只移动焦点，方向键和全选主动建立选择', async () => {
  const view = fixture();
  try {
    assert.equal(
      view.dispatch('keydown', { key: 'c', ctrlKey: true }).defaultPrevented,
      false,
    );
    assert.equal(
      view.dispatch('keydown', { key: 'Tab' }).defaultPrevented,
      false,
    );
    await view.controller.copy();
    assert.deepEqual(view.writes, []);
    view.dispatch('keydown', { key: 'ArrowDown' });
    assert.deepEqual(view.controller.getState().focus, { row: 1, column: 0 });
    await view.controller.copy();
    assert.deepEqual(view.writes, ['value']);
    view.controller.clearSelection();
    view.dispatch('keydown', { key: 'a', ctrlKey: true });
    assert.deepEqual(view.controller.range, {
      startRow: 1,
      endRow: 10,
      startColumn: 0,
      endColumn: 4,
    });
  } finally {
    view.controller.dispose();
  }
});

test('单元格点击建立选择，鼠标空白清除，表头与交互按钮保留选择', () => {
  const view = fixture();
  try {
    view.dispatch('pointerdown', { target: view.cell });
    view.dispatch('pointerup');
    assert.ok(view.controller.range);
    const header = view.document.createElement('div');
    header.setAttribute('role', 'columnheader');
    view.host.append(header);
    view.dispatch('pointerdown', { target: header, clientX: 300 });
    assert.ok(view.controller.range);
    const button = view.document.createElement('button');
    view.host.append(button);
    view.dispatch('pointerdown', { target: button, clientX: 300 });
    assert.ok(view.controller.range);
    view.dispatch('pointerdown', { clientX: 300 });
    assert.equal(view.controller.range, undefined);
  } finally {
    view.controller.dispose();
  }
});

test('触屏空白轻点清除，滑动保留选择，Esc停止自动滚动', () => {
  const view = fixture();
  try {
    view.controller.select({ row: 1, column: 0 });
    view.dispatch('pointerdown', { pointerType: 'touch', clientX: 300 });
    view.dispatch('pointermove', { pointerType: 'touch', clientX: 330 });
    view.dispatch('pointerup', { pointerType: 'touch', clientX: 330 });
    assert.ok(view.controller.range);
    view.dispatch('pointerdown', { pointerType: 'touch', clientX: 300 });
    view.dispatch('pointerup', { pointerType: 'touch', clientX: 300 });
    assert.equal(view.controller.range, undefined);
    view.dispatch('pointerdown');
    view.dispatch('pointermove', { clientX: 40 });
    assert.equal(view.frames.size, 1);
    view.dispatch('keydown', { key: 'Escape' });
    assert.equal(view.frames.size, 0);
    assert.equal(view.controller.range, undefined);
  } finally {
    view.controller.dispose();
  }
});

test('清除选区取消尚未完成的复制，旧内容不会写入剪贴板', async () => {
  const view = fixture();
  let release;
  const ready = new Promise((resolve) => {
    release = resolve;
  });
  view.adapter.readRows = async function* () {
    await ready;
    yield ['late'];
  };
  try {
    view.controller.select({ row: 1, column: 0 });
    const copying = view.controller.copy();
    const rejected = assert.rejects(copying, { name: 'AbortError' });
    view.controller.clearSelection();
    release();
    await rejected;
    assert.deepEqual(view.writes, []);
  } finally {
    view.controller.dispose();
  }
});

test('阅读区外部空白清除，工具栏与其他查看器操作保留当前选择', () => {
  const view = fixture();
  try {
    view.controller.select({ row: 1, column: 0 });
    const toolbar = view.document.createElement('div');
    view.viewer.append(toolbar);
    view.clickOutside(toolbar);
    assert.ok(view.controller.range);
    const nested = view.document.createElement('section');
    nested.className = 'filumo-viewer';
    view.viewport.append(nested);
    view.clickOutside(nested);
    assert.ok(view.controller.range);
    const panel = view.document.createElement('div');
    panel.dataset.gridInteractive = '';
    view.viewport.append(panel);
    view.clickOutside(panel);
    assert.ok(view.controller.range);
    view.clickOutside(view.viewport);
    assert.equal(view.controller.range, undefined);
  } finally {
    view.controller.dispose();
  }
});
