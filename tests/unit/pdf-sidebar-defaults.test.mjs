import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument } from './helpers/reading-dom.mjs';

const bundle = await build({
  entryPoints: ['packages/pdf/src/view/PdfSidebar.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [
    {
      name: 'sidebar-panel-boundaries',
      setup(builder) {
        builder.onResolve(
          { filter: /^\.\/(PdfOutline|PdfThumbnails|PdfSearchPanel)$/ },
          ({ path }) => ({ path: path.slice(2), namespace: 'fixture' }),
        );
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          contents: `
        export class ${path} {
          constructor(document) {
            this.element = document.createElement('div');
            this.element.className = '${path}';
          }
          setActive(active) {this.element.dataset.active = String(active);}
          setEntries(entries) {this.entries = entries;}
          getCount() {return this.entries?.length ?? 0;}
          setLocale() {}
          update() {}
          updateCurrent() {}
          setReadingPosition() {}
          focus() {this.element.focus();}
          dispose() {this.setActive(false);}
        }
      `,
        }));
      },
    },
  ],
});
const { PdfSidebar } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

/** 隔离面板渲染，验证默认策略、资源激活与异步操作顺序。 */
function fixture() {
  const document = createDocument();
  const create = document.createElement;
  document.createElement = (...args) => {
    const node = create(...args);
    node.classList.toggle = (name, active) =>
      active ? node.classList.add(name) : node.classList.remove(name);
    return node;
  };
  let resolve, reject, signal;
  const pending = new Promise((deliver, fail) => {
    resolve = deliver;
    reject = fail;
  });
  let changes = 0;
  const sidebar = new PdfSidebar(
    document,
    {
      pageCount: 5,
      readOutline(abortSignal) {
        signal = abortSignal;
        return pending;
      },
    },
    {},
    { setActive() {} },
    () => {},
    () => {
      changes++;
    },
    'zh-CN',
  );
  return {
    sidebar,
    document,
    resolve,
    reject,
    get signal() {
      return signal;
    },
    get changes() {
      return changes;
    },
    thumbnails: sidebar.element.querySelector('.PdfThumbnails'),
    expand() {
      sidebar.element.querySelector('.filumo-pdf-sidebar-expand').onclick();
    },
  };
}
const outline = [{ title: '章节一', pageIndex: 0, children: [] }];
const settled = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

test('初始收起，读取到大纲后自动展开，缩略图保持停用', async () => {
  const view = fixture();
  try {
    assert.equal(view.sidebar.getState().open, false);
    assert.equal(view.sidebar.element.dataset.collapsed, 'true');
    assert.equal(view.thumbnails.dataset.active, 'false');
    view.resolve(outline);
    await settled();
    assert.deepEqual(view.sidebar.getState(), {
      available: true,
      open: true,
      mode: 'outline',
    });
    assert.equal(view.thumbnails.dataset.active, 'false');
  } finally {
    view.sidebar.dispose();
  }
});

test('无大纲保持收起，手动展开后才激活缩略图', async () => {
  const view = fixture();
  try {
    view.resolve([]);
    await settled();
    assert.deepEqual(view.sidebar.getState(), {
      available: false,
      open: false,
      mode: 'thumbnails',
    });
    assert.equal(view.thumbnails.dataset.active, 'false');
    view.expand();
    assert.equal(view.sidebar.getState().open, true);
    assert.equal(view.thumbnails.dataset.active, 'true');
    view.sidebar.collapse();
    assert.equal(view.thumbnails.dataset.active, 'false');
    view.expand();
    assert.equal(view.sidebar.getState().mode, 'thumbnails');
  } finally {
    view.sidebar.dispose();
  }
});

test('读取失败保持收起，并保留独立的失败信息', async () => {
  const view = fixture();
  try {
    view.reject(new Error('读取测试失败'));
    await settled();
    assert.equal(view.sidebar.getState().open, false);
    assert.equal(view.thumbnails.dataset.active, 'false');
    view.sidebar.select('outline');
    assert.match(
      view.sidebar.element.querySelector('.filumo-pdf-outline-status')
        .textContent,
      /大纲读取失败.*读取测试失败/,
    );
  } finally {
    view.sidebar.dispose();
  }
});

for (const mode of ['thumbnails', 'search']) {
  for (const entries of [outline, []]) {
    test(`用户提前打开${mode}后，大纲${
      entries.length ? '有内容' : '为空'
    }均保留当前模式`, async () => {
      const view = fixture();
      try {
        view.sidebar.select(mode, mode === 'search');
        view.resolve(entries);
        await settled();
        assert.equal(view.sidebar.getState().mode, mode);
        assert.equal(view.sidebar.getState().open, true);
        assert.equal(
          view.thumbnails.dataset.active,
          String(mode === 'thumbnails'),
        );
        if (mode === 'search')
          assert.equal(view.document.activeElement.className, 'PdfSearchPanel');
      } finally {
        view.sidebar.dispose();
      }
    });
  }
}

test('用户提前收起后，有大纲也保留收起状态', async () => {
  const view = fixture();
  try {
    view.sidebar.collapse();
    view.resolve(outline);
    await settled();
    assert.equal(view.sidebar.getState().available, true);
    assert.equal(view.sidebar.getState().open, false);
    view.expand();
    assert.equal(view.sidebar.getState().mode, 'outline');
  } finally {
    view.sidebar.dispose();
  }
});

test('加载中首次展开进入缩略图，晚到的大纲保留手动选择', async () => {
  const view = fixture();
  try {
    view.expand();
    assert.equal(view.sidebar.getState().mode, 'thumbnails');
    view.resolve(outline);
    await settled();
    assert.equal(view.sidebar.getState().mode, 'thumbnails');
    assert.equal(view.sidebar.getState().open, true);
  } finally {
    view.sidebar.dispose();
  }
});

test('失败结果保留用户打开的查找，重新展开恢复该模式', async () => {
  const view = fixture();
  try {
    view.sidebar.select('search', true);
    view.reject(new Error('读取失败'));
    await settled();
    assert.equal(view.sidebar.getState().open, true);
    view.sidebar.collapse();
    view.expand();
    assert.equal(view.sidebar.getState().mode, 'search');
  } finally {
    view.sidebar.dispose();
  }
});

test('释放后晚到的结果不再更新侧栏', async () => {
  const view = fixture();
  view.sidebar.dispose();
  assert.equal(view.signal.aborted, true);
  view.resolve(outline);
  await settled();
  assert.equal(view.changes, 0);
  assert.equal(view.thumbnails.dataset.active, 'false');
});
