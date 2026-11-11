import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createDocument } from './helpers/reading-dom.mjs';

const bundle = await build({
  stdin: {
    contents: `export {createToolbarOverflow} from './packages/dom/src/shell/overflow';
      export {createDownloadControl} from './packages/dom/src/shell/DownloadControl';`,
    resolveDir: process.cwd(),
  },
  alias: { '@filumo/core': process.cwd() + '/packages/core/src/index.ts' },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [
    {
      name: 'menu-boundary',
      setup(builder) {
        builder.onResolve({ filter: /^\.\/ToolbarMenu$/ }, () => ({
          path: 'menu',
          namespace: 'fixture',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: `export function createToolbarMenu(trigger, owner) {
          return {opened: false, update(items) {owner.items = items;}, close() {}, dispose() {}};
        }`,
        }));
      },
    },
  ],
});
const { createToolbarOverflow, createDownloadControl } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

/** 用固定控件宽度验证收纳算法，真实字体和 CSS 尺寸由人工验收。 */
function fixture(width) {
  const document = createDocument();
  const create = document.createElement;
  let toolbar;
  let resize;
  let scheduled;
  document.defaultView = {
    requestAnimationFrame(callback) {
      scheduled = callback;
      return 1;
    },
    cancelAnimationFrame() {
      scheduled = undefined;
    },
    ResizeObserver: class {
      constructor(callback) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  };
  document.createElement = (tag) => {
    const node = create();
    node.tagName = tag.toUpperCase();
    node.hidden = false;
    node.classList.toggle = (name, value) => {
      if (value) node.classList.add(name);
      else node.classList.remove(name);
    };
    node.width = tag === 'button' ? 32 : undefined;
    node.closest = () => toolbar;
    node.insertBefore = (child, cursor) => {
      child.remove();
      const index = cursor
        ? node.children.indexOf(cursor)
        : node.children.length;
      node.children.splice(index, 0, child);
      child.parentElement = node;
    };
    node.append = (...children) =>
      children.forEach((child) => node.insertBefore(child, null));
    node.prepend = (...children) =>
      children
        .reverse()
        .forEach((child) => node.insertBefore(child, node.firstChild));
    node.replaceChildren = (...children) => {
      [...node.children].forEach((child) => child.remove());
      node.append(...children);
    };
    node.remove = () => {
      const parent = node.parentElement;
      if (parent)
        parent.children = parent.children.filter((child) => child !== node);
      node.parentElement = undefined;
      if (document.activeElement === node) document.activeElement = undefined;
    };
    node.replaceWith = (replacement) => {
      const parent = node.parentElement;
      const cursor = node.nextSibling;
      node.remove();
      parent?.insertBefore(replacement, cursor);
    };
    Object.defineProperties(node, {
      firstChild: { get: () => node.children[0] },
      nextSibling: {
        get: () => {
          const siblings = node.parentElement?.children ?? [];
          return siblings[siblings.indexOf(node) + 1];
        },
      },
      isConnected: { get: () => toolbar?.contains(node) },
    });
    return node;
  };
  document.createElementNS = (_namespace, tag) => document.createElement(tag);
  const measured = (node) =>
    node.hidden
      ? 0
      : node.width ??
        node.children.reduce((sum, child) => sum + measured(child), 0);
  toolbar = document.createElement('div');
  toolbar.className = 'filumo-toolbar';
  Object.defineProperties(toolbar, {
    clientWidth: { get: () => width },
    scrollWidth: { get: () => measured(toolbar) },
  });
  const container = document.createElement('div');
  toolbar.append(container);
  const binding = createToolbarOverflow(container, (error) => {
    throw error;
  });
  const main = container.children[0];
  const more = toolbar.children[1];
  const item = (id, itemWidth, priority, secondary = false) => {
    const node = document.createElement('button');
    node.width = itemWidth;
    return { node, priority, secondary, menu: { id, label: id, run() {} } };
  };
  return {
    toolbar,
    binding,
    main,
    more,
    item,
    document,
    resize(nextWidth) {
      width = nextWidth;
      resize();
      const callback = scheduled;
      scheduled = undefined;
      callback?.();
    },
  };
}

test('宽度足够时全部展开，低优先级先收纳，增加宽度后恢复原节点', () => {
  const view = fixture(300);
  const auxiliary = view.item('copy', 80, 40);
  const paging = view.item('paging', 120, 120);
  const download = view.item('download', 40, 140);
  const items = [auxiliary, paging, download];
  view.binding.update(items, false);
  assert.deepEqual(
    view.main.children,
    items.map((item) => item.node),
  );
  assert.equal(view.more.hidden, true);
  view.resize(220);
  assert.deepEqual(
    view.more.items.map((item) => item.id),
    ['copy'],
  );
  assert.deepEqual(view.main.children, [paging.node, download.node]);
  assert.ok(view.toolbar.scrollWidth <= view.toolbar.clientWidth);
  view.resize(300);
  assert.deepEqual(
    view.main.children,
    items.map((item) => item.node),
  );
  assert.equal(view.more.hidden, true);
  view.binding.dispose();
});

test('极窄时最高优先级和外壳操作均可收纳，焦点转移到更多', () => {
  const view = fixture(300);
  const paging = view.item('paging', 150, Infinity);
  const download = view.item('download', 40, 140);
  view.binding.update([paging, download], false);
  paging.node.focus();
  view.resize(40);
  assert.equal(view.main.children.length, 0);
  assert.equal(view.more.hidden, false);
  assert.deepEqual(
    view.more.items.map((item) => item.id),
    ['paging', 'download'],
  );
  assert.ok(view.toolbar.scrollWidth <= view.toolbar.clientWidth);
  assert.equal(view.document.activeElement, view.more.children[0]);
  view.binding.dispose();
});

test('显式更多保持收起，能力移除后清理菜单，尺寸变化不会恢复过期节点', () => {
  const view = fixture(500);
  const secondary = view.item('advanced', 40, 10, true);
  view.binding.update([secondary], false);
  assert.equal(view.main.children.length, 0);
  assert.deepEqual(
    view.more.items.map((item) => item.id),
    ['advanced'],
  );
  view.binding.update([], false);
  view.resize(100);
  view.binding.update([], false);
  assert.equal(view.more.hidden, true);
  assert.deepEqual(view.more.items, []);
  view.binding.dispose();
});

test('分隔线只依附实际主栏兄弟节点，打开文件隐藏后没有容器残留线', async () => {
  const styles = await readFile('packages/dom/src/shell.less', 'utf8');
  assert.doesNotMatch(
    styles,
    /\.filumo-controls::before|\.filumo-controls\s*\+\s*button/,
  );
  assert.match(styles, /> \.filumo-open-file \+ \*/);
  assert.match(styles, /filumo-toolbar-download\s*\):not\(:first-child\)/);
});

test('下载收纳项复用当前来源，执行中保留禁用与忙碌标签，多目标过滤无效项', async () => {
  const view = fixture(300);
  const button = view.document.createElement('button');
  view.toolbar.append(button);
  let release;
  let handledSource;
  const source = { name: 'child.xlsx' };
  const state = {
    session: { source, signal: new AbortController().signal },
    ready: true,
    active: true,
    locale: 'zh-CN',
    capabilities: {},
    handler: async (current) => {
      handledSource = current;
      await new Promise((resolve) => {
        release = resolve;
      });
    },
  };
  const download = createDownloadControl(
    button,
    view.toolbar,
    () => state,
    () => {},
    (error) => {
      throw error;
    },
  );
  download.update();
  const item = download.toolbarItem();
  assert.equal(item.node.hidden, false);
  assert.equal(item.menu.disabled, false);
  const pending = item.menu.run();
  await Promise.resolve();
  assert.equal(handledSource, source);
  assert.equal(download.toolbarItem().menu.disabled, true);
  assert.equal(download.toolbarItem().menu.label, '下载中');
  release();
  await pending;
  assert.equal(download.toolbarItem().menu.disabled, false);
  state.capabilities = {
    originalDownload: { enabled: false },
    downloadTargets: [
      {
        id: 'hidden',
        kind: 'custom',
        label: '不可下载',
        enabled: false,
        run() {},
      },
      { id: 'child', kind: 'custom', label: '子文件', run() {} },
    ],
  };
  download.update();
  assert.deepEqual(
    download.toolbarItem().menu.children.map((item) => item.id),
    ['child'],
  );
  state.capabilities.downloadTargets.pop();
  download.update();
  assert.equal(download.toolbarItem().node.hidden, true);
  download.dispose();
  view.binding.dispose();
});
