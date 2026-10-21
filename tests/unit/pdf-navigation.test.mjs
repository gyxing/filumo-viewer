import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { createDocument } from './helpers/reading-dom.mjs';

const bundle = await build({
  stdin: {
    contents: `export {PdfSearch} from './packages/pdf/src/view/PdfSearch';export {PdfSidebar} from './packages/pdf/src/view/PdfSidebar';export {PdfSearchPanel} from './packages/pdf/src/view/PdfSearchPanel';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  alias: { '@filumo/dom/outline': resolve('packages/dom/src/outline.ts') },
  plugins: [
    {
      name: 'pdf-panel-boundaries',
      setup(builder) {
        builder.onLoad({ filter: /\.less$/ }, () => ({
          contents: '',
          loader: 'js',
        }));
        builder.onResolve({ filter: /^\.\/PdfSearchPanel$/ }, () => ({
          path: 'search',
          namespace: 'fixture',
        }));
        builder.onResolve({ filter: /^\.\/PdfThumbnails$/ }, () => ({
          path: 'thumbnails',
          namespace: 'fixture',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          loader: 'js',
          contents:
            path === 'search'
              ? `export class PdfSearchPanel {constructor(document){this.element=document.createElement('div');this.element.className='fixture-search';}setActive(value){this.element.dataset.active=String(value);}focus(){this.element.focus();}update(){}dispose(){this.element.remove();}}`
              : `export class PdfThumbnails {constructor(document){this.element=document.createElement('div');this.element.className='fixture-thumbnails';}setActive(value){this.element.dataset.active=String(value);}updateCurrent(index){this.element.dataset.page=String(index);}update(){}dispose(){this.element.remove();}}`,
        }));
      },
    },
  ],
});
const { PdfSearch, PdfSidebar, PdfSearchPanel } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

function documentFixture() {
  const document = createDocument(),
    create = document.createElement;
  document.createElement = (tag) => {
    const node = create();
    node.tagName = tag.toUpperCase();
    node.removeAttribute = (name) => node.attributes.delete(name);
    node.classList = {
      add(...names) {
        node.className = [
          ...(node.className ?? '').split(' ').filter(Boolean),
          ...names,
        ].join(' ');
      },
      toggle(name, value) {
        const names = new Set(
          (node.className ?? '').split(' ').filter(Boolean),
        );
        if (value) names.add(name);
        else names.delete(name);
        node.className = [...names].join(' ');
      },
    };
    return node;
  };
  document.createElementNS = (_namespace, tag) => document.createElement(tag);
  return document;
}
const backendFixture = (overrides = {}) => ({
  pageCount: 3,
  readText: async (index) => ({ text: 'find page ' + index, runs: [] }),
  cleanupPage: async () => {},
  readOutline: async () => [],
  ...overrides,
});

test('查找暂停后保留结果和选择，从未完成页面继续，不重复扫描第一页', async () => {
  const reads = [],
    search = new PdfSearch(
      backendFixture({
        readText: async (index) => {
          reads.push(index);
          return { text: 'find page ' + index, runs: [] };
        },
      }),
      {},
    );
  let paused = false;
  const stop = search.subscribe(() => {
    if (!paused && search.getSnapshot().scannedPages === 1) {
      paused = true;
      search.setActive(false);
    }
  });
  try {
    await search.setQuery('find');
    assert.deepEqual(reads, [0]);
    assert.equal(search.getSnapshot().resultCount, 1);
    const navigationSignal = search.signal;
    assert.equal(navigationSignal.aborted, false);
    const revision = search.getSnapshot().navigationRevision;
    search.setActive(true);
    await search.resume();
    assert.deepEqual(reads, [0, 1, 2]);
    assert.equal(search.getSnapshot().resultCount, 3);
    assert.equal(search.getSnapshot().currentIndex, 0);
    assert.equal(search.getSnapshot().navigationRevision, revision);
    assert.equal(search.signal, navigationSignal);
    search.select(2);
    assert.equal(navigationSignal.aborted, true);
    assert.equal(search.getCurrent().pageIndex, 2);
  } finally {
    stop();
    search.dispose();
  }
});

test('切换查询拒绝迟到结果，结果片段长度有界', async () => {
  let deliver;
  const search = new PdfSearch(
    backendFixture({
      pageCount: 1,
      readText: () =>
        new Promise((resolve) => {
          deliver = resolve;
        }),
    }),
    {},
  );
  const first = search.setQuery('old');
  await Promise.resolve();
  search.setActive(false);
  const second = search.setQuery('new');
  deliver({ text: 'old content', runs: [] });
  await first;
  await second;
  assert.equal(search.getSnapshot().query, 'new');
  assert.equal(search.getSnapshot().resultCount, 0);
  search.dispose();
  const bounded = new PdfSearch(
    backendFixture({
      pageCount: 1,
      readText: async () => ({
        text: 'x'.repeat(500) + 'target' + 'y'.repeat(500),
        runs: [],
      }),
    }),
    {},
  );
  try {
    await bounded.setQuery('target');
    const hit = bounded.getResults(0, 1)[0];
    assert.equal(hit.preview.match, 'target');
    assert.ok(hit.preview.before.length + hit.preview.after.length < 120);
  } finally {
    bounded.dispose();
  }
});

test('无大纲默认进入缩略图，工具栏大纲切换和查找聚焦保持侧栏状态', async () => {
  const document = documentFixture(),
    backend = backendFixture(),
    search = new PdfSearch(backend, {}),
    sidebar = new PdfSidebar(
      document,
      backend,
      {},
      search,
      () => {},
      () => {},
    );
  try {
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(sidebar.getState().mode, 'thumbnails');
    assert.equal(sidebar.getState().open, true);
    sidebar.select('search', true);
    await search.setQuery('find');
    const revision = search.getSnapshot().navigationRevision;
    sidebar.select('thumbnails');
    sidebar.select('search', true);
    assert.equal(search.getSnapshot().query, 'find');
    assert.equal(search.getSnapshot().resultCount, 3);
    assert.equal(search.getSnapshot().navigationRevision, revision);
    sidebar.show('outline');
    assert.equal(sidebar.getState().mode, 'outline');
    assert.equal(sidebar.getState().open, true);
    sidebar.show('outline');
    assert.equal(sidebar.getState().open, false);
    sidebar.select('search', true);
    assert.equal(sidebar.getState().open, true);
    assert.equal(
      document.activeElement,
      sidebar.element.querySelector('.fixture-search'),
    );
  } finally {
    sidebar.dispose();
    search.dispose();
  }
});

test('侧栏使用正文阅读位置同步大纲，重复页码发布不覆盖同页子标题', async () => {
  const document = documentFixture(),
    backend = backendFixture({
      readOutline: async () => [
        {
          id: 'chapter',
          title: '章节',
          pageIndex: 0,
          destination: { top: 0 },
          children: [
            {
              id: 'section',
              title: '子节',
              pageIndex: 0,
              destination: { top: 0.5 },
              children: [],
            },
          ],
        },
      ],
      getOutlineOffset: async (_page, destination) => destination.top,
    }),
    search = new PdfSearch(backend, {}),
    sidebar = new PdfSidebar(
      document,
      backend,
      {},
      search,
      () => {},
      () => {},
    );
  try {
    await new Promise((resolve) => setTimeout(resolve, 0));
    sidebar.updateReadingPosition({
      pageIndex: 0,
      ratio: 0.7,
      rotation: 0,
      interaction: 1,
    });
    sidebar.updateCurrent(0);
    const selected = () =>
      sidebar.element
        .querySelector('[data-outline-id="section"]')
        .getAttribute('aria-selected');
    assert.equal(selected(), 'true');
    sidebar.select('search');
    sidebar.updateReadingPosition({
      pageIndex: 0,
      ratio: 0.8,
      rotation: 0,
      interaction: 2,
    });
    sidebar.select('outline');
    assert.equal(selected(), 'true');
  } finally {
    sidebar.dispose();
    search.dispose();
  }
});

test('大纲异步完成不能覆盖用户已选中的查找 Tab', async () => {
  let deliver;
  const document = documentFixture(),
    backend = backendFixture({
      readOutline: () =>
        new Promise((resolve) => {
          deliver = resolve;
        }),
    }),
    search = new PdfSearch(backend, {}),
    sidebar = new PdfSidebar(
      document,
      backend,
      {},
      search,
      () => {},
      () => {},
    );
  try {
    sidebar.select('search');
    deliver([]);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(sidebar.getState().mode, 'search');
  } finally {
    sidebar.dispose();
    search.dispose();
  }
});

test('查找结果按窗口创建，切换面板和语言保留列表位置及当前选择', async () => {
  const document = documentFixture(),
    search = new PdfSearch(
      backendFixture({
        pageCount: 1,
        readText: async () => ({ text: 'find '.repeat(100), runs: [] }),
      }),
      {},
    ),
    panel = new PdfSearchPanel(document, search, () => {});
  try {
    panel.setActive(true);
    await search.setQuery('find');
    const list = panel.element.querySelector('.filumo-pdf-search-results'),
      canvas = panel.element.querySelector('.filumo-pdf-search-canvas');
    assert.equal(search.getSnapshot().resultCount, 100);
    assert.ok(canvas.children.length < 20);
    search.select(60);
    const top = list.scrollTop;
    assert.ok(top > 0);
    panel.setActive(false);
    panel.setActive(true);
    panel.update('en-US');
    assert.equal(list.scrollTop, top);
    assert.equal(search.getSnapshot().currentIndex, 60);
    const selected = canvas.children.find(
      (node) => node.getAttribute('aria-selected') === 'true',
    );
    assert.equal(selected.children[0].textContent, 'Page 1');
    panel.focus();
    assert.equal(
      document.activeElement.getAttribute('aria-label'),
      'Find in PDF',
    );
    await search.setQuery('');
    assert.equal(canvas.children.length, 0);
    assert.equal(list.scrollTop, 0);
  } finally {
    panel.dispose();
    search.dispose();
  }
});
