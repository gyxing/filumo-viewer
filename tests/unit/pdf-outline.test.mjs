import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { createDocument } from './helpers/reading-dom.mjs';
const result = await build({
  entryPoints: ['packages/pdf/src/view/PdfOutline.ts'],
  alias: { '@fivo/dom/outline': resolve('packages/dom/src/outline.ts') },
  loader: { '.less': 'empty' },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { PdfOutline } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')
);
const node = (id, pageIndex, children = []) => ({
  id,
  title: '相同标题',
  pageIndex,
  children,
});

test('书签坐标未就绪时保留稳定选择，完成后直接定位最新标题而不经过页首目录', async () => {
  let deliver;
  const gate = new Promise((resolve) => {
    deliver = resolve;
  });
  const document = createDocument(),
    selections = [],
    create = document.createElement;
  document.createElement = (...args) => {
    const element = create(...args),
      set = element.setAttribute;
    element.setAttribute = function (name, value) {
      if (name === 'aria-selected' && value === 'true')
        selections.push(this.dataset.outlineId);
      return set.call(this, name, value);
    };
    return element;
  };
  const outline = new PdfOutline(document, () => {}, undefined, undefined, {
    backend: {
      getOutlineOffset: async (_page, destination) => {
        await gate;
        return destination.top;
      },
    },
  });
  try {
    outline.element.clientHeight = 56;
    outline.setEntries([
      node('stable', 0),
      ...Array.from({ length: 60 }, (_, index) => ({
        ...node('n' + index, 1),
        destination: { top: (index + 10) / 100 },
      })),
    ]);
    outline.setReadingPosition({
      pageIndex: 1,
      ratio: 0.65,
      rotation: 0,
      interaction: 1,
    });
    await Promise.resolve();
    assert.equal(
      outline.element
        .querySelector('[data-outline-id="stable"]')
        .getAttribute('aria-selected'),
      'true',
    );
    assert.equal(outline.element.scrollTop, 0);
    outline.setReadingPosition({
      pageIndex: 1,
      ratio: 0.55,
      rotation: 0,
      interaction: 2,
    });
    deliver();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(
      outline.element
        .querySelector('[data-outline-id="n45"]')
        .getAttribute('aria-selected'),
      'true',
    );
    assert.equal(selections.includes('n0'), false);
    assert.equal(selections.includes('n55'), false);
    assert.ok(outline.element.scrollTop > 0);
  } finally {
    deliver();
    outline.dispose();
  }
});

test('章节从半页开始时保留上一章节，正反向越过真实起点才切换', async () => {
  const outline = new PdfOutline(
    createDocument(),
    () => {},
    undefined,
    undefined,
    {
      backend: {
        getOutlineOffset: async (_page, destination) => destination.top,
      },
    },
  );
  try {
    outline.setEntries([
      { ...node('a', 0), destination: { top: 0.2 } },
      { ...node('b', 0), destination: { top: 0.7 } },
      { ...node('c', 1), destination: { top: 0.6 } },
    ]);
    const select = async (pageIndex, ratio) => {
      outline.setReadingPosition({
        pageIndex,
        ratio,
        rotation: 0,
        interaction: 1,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
    const selected = (id) =>
      outline.element
        .querySelector('[data-outline-id="' + id + '"]')
        .getAttribute('aria-selected');
    await select(0, 0.9);
    assert.equal(selected('b'), 'true');
    await select(1, 0.1);
    assert.equal(selected('b'), 'true');
    await select(1, 0.5999);
    assert.equal(selected('b'), 'true');
    await select(1, 0.6);
    assert.equal(selected('c'), 'true');
    await select(1, 0.59);
    assert.equal(selected('b'), 'true');
    await select(0, 0.6);
    assert.equal(selected('a'), 'true');
  } finally {
    outline.dispose();
  }
});

test('直接进入未缓存页的标题之前，只提交上一页最后一个标题', async () => {
  const document = createDocument(),
    outline = new PdfOutline(document, () => {}, undefined, undefined, {
      backend: {
        getOutlineOffset: async (_page, destination) => destination.top,
      },
    });
  try {
    outline.setReadingPosition({
      pageIndex: 7,
      ratio: 0.1,
      rotation: 0,
      interaction: 1,
    });
    outline.setEntries([
      { ...node('earlier', 3), destination: { top: 0.2 } },
      { ...node('previous', 3), destination: { top: 0.8 } },
      { ...node('next', 7), destination: { top: 0.6 } },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(
      outline.element
        .querySelector('[data-outline-id="previous"]')
        .getAttribute('aria-selected'),
      'true',
    );
    assert.equal(
      outline.element
        .querySelector('[data-outline-id="next"]')
        .getAttribute('aria-selected'),
      'false',
    );
  } finally {
    outline.dispose();
  }
});

test('同一帧的目录自动定位合并到最终节点，隐藏和销毁取消待定位任务', () => {
  const document = createDocument(),
    frames = new Map();
  let sequence = 0;
  document.defaultView = {
    requestAnimationFrame: (callback) => {
      frames.set(++sequence, callback);
      return sequence;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  const outline = new PdfOutline(document, () => {});
  const flush = () => {
    const jobs = [...frames.values()];
    frames.clear();
    jobs.forEach((callback) => callback());
  };
  try {
    outline.element.clientHeight = 56;
    outline.setEntries(
      Array.from({ length: 100 }, (_, index) => node('n' + index, index)),
    );
    flush();
    outline.setCurrentPage(40);
    outline.setCurrentPage(80);
    assert.equal(outline.element.scrollTop, 0);
    assert.equal(frames.size, 1);
    flush();
    assert.equal(
      outline.element
        .querySelector('[data-outline-id="n80"]')
        .getAttribute('aria-selected'),
      'true',
    );
    const top = outline.element.scrollTop;
    outline.setCurrentPage(90);
    outline.setActive(false);
    flush();
    assert.equal(outline.element.scrollTop, top);
    outline.setActive(true);
    flush();
    assert.equal(
      outline.element
        .querySelector('[data-outline-id="n90"]')
        .getAttribute('aria-selected'),
      'true',
    );
    outline.setCurrentPage(99);
    outline.dispose();
    assert.equal(frames.size, 0);
  } finally {
    outline.dispose();
  }
});

test('同页阅读位置切换子标题并滚动大纲，隐藏恢复保留最新阅读位置且不反向导航', async () => {
  const navigated = [],
    document = createDocument();
  const outline = new PdfOutline(
    document,
    (index) => navigated.push(index),
    undefined,
    undefined,
    {
      backend: {
        getOutlineOffset: async (_page, destination) => destination.top,
      },
    },
  );
  const entries = Array.from({ length: 100 }, (_, index) => ({
    ...node('n' + index, 0),
    destination: { top: index / 100 },
  }));
  try {
    outline.element.clientHeight = 56;
    outline.setEntries(entries);
    outline.setReadingPosition({
      pageIndex: 0,
      ratio: 0.75,
      rotation: 0,
      interaction: 0,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(
      outline.element
        .querySelector('[data-outline-id="n75"]')
        .getAttribute('aria-selected'),
      'true',
    );
    assert.ok(outline.element.scrollTop > 0);
    outline.element.scrollTop = 0;
    outline.setReadingPosition({
      pageIndex: 0,
      ratio: 0.751,
      rotation: 0,
      interaction: 0,
    });
    assert.equal(outline.element.scrollTop, 0);
    outline.setActive(false);
    outline.setReadingPosition({
      pageIndex: 0,
      ratio: 0.9,
      rotation: 0,
      interaction: 1,
    });
    outline.setActive(true);
    assert.equal(
      outline.element
        .querySelector('[data-outline-id="n90"]')
        .getAttribute('aria-selected'),
      'true',
    );
    assert.deepEqual(navigated, []);
  } finally {
    outline.dispose();
  }
});

test('跨页后忽略旧坐标任务，只换算当前书签页且销毁取消等待', async () => {
  const reads = [],
    pending = new Map();
  const outline = new PdfOutline(
    createDocument(),
    () => {},
    undefined,
    undefined,
    {
      backend: {
        getOutlineOffset: (page, _destination, _rotation, signal) => {
          reads.push(page);
          return new Promise((resolve) =>
            pending.set(page, { resolve, signal }),
          );
        },
      },
    },
  );
  try {
    outline.setEntries([
      { ...node('a', 0), destination: { top: 0.1 } },
      { ...node('b', 3), destination: { top: 0.5 } },
      { ...node('c', 7), destination: { top: 0.8 } },
    ]);
    await Promise.resolve();
    assert.deepEqual(reads, [0]);
    outline.setReadingPosition({
      pageIndex: 3,
      ratio: 0.7,
      rotation: 0,
      interaction: 1,
    });
    await Promise.resolve();
    assert.equal(pending.get(0).signal.aborted, true);
    pending.get(3).resolve(0.5);
    pending.get(0).resolve(0.1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(reads, [0, 3]);
    assert.equal(
      outline.element
        .querySelector('[data-outline-id="b"]')
        .getAttribute('aria-selected'),
      'true',
    );
    outline.setReadingPosition({
      pageIndex: 7,
      ratio: 0.9,
      rotation: 0,
      interaction: 2,
    });
    await Promise.resolve();
    outline.dispose();
    assert.equal(pending.get(7).signal.aborted, true);
    pending.get(7).resolve(0.8);
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    outline.dispose();
  }
});

test('点击目录定位期间保留节点，用户再次滚动可取消旧定位', async () => {
  let finish, signal;
  const outline = new PdfOutline(createDocument(), (_index, _ratio, owned) => {
    signal = owned;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  try {
    outline.setEntries([node('a', 0), node('b', 2)]);
    outline.element.querySelector('[data-outline-id="b"]').onclick();
    outline.setReadingPosition({
      pageIndex: 1,
      ratio: 0,
      rotation: 0,
      interaction: 0,
    });
    assert.equal(
      outline.element
        .querySelector('[data-outline-id="b"]')
        .getAttribute('aria-selected'),
      'true',
    );
    outline.setReadingPosition({
      pageIndex: 1,
      ratio: 0.1,
      rotation: 0,
      interaction: 1,
    });
    assert.equal(signal.aborted, true);
    assert.equal(
      outline.element
        .querySelector('[data-outline-id="a"]')
        .getAttribute('aria-selected'),
      'true',
    );
    finish();
    await Promise.resolve();
    outline.element.querySelector('[data-outline-id="b"]').onclick();
    outline.setReadingPosition({
      pageIndex: 1,
      ratio: 0.1,
      rotation: 90,
      interaction: 1,
    });
    assert.equal(signal.aborted, true);
    finish();
    await Promise.resolve();
  } finally {
    outline.dispose();
  }
});
test('PDF 同页书签独立可选，同页更新保留选择，正文同步不触发跳转', () => {
  const pages = [],
    outline = new PdfOutline(createDocument(), (page) => pages.push(page));
  try {
    outline.setEntries([node('a', 0), node('b', 0), node('c', 2)]);
    outline.element.querySelector('[data-outline-id="b"]').onclick();
    outline.setCurrentPage(0);
    assert.equal(
      outline.element
        .querySelector('[data-outline-id="b"]')
        .getAttribute('aria-selected'),
      'true',
    );
    outline.setCurrentPage(2);
    assert.equal(
      outline.element
        .querySelector('[data-outline-id="c"]')
        .getAttribute('aria-selected'),
      'true',
    );
    outline.setCurrentPage(0);
    assert.equal(
      outline.element
        .querySelector('[data-outline-id="a"]')
        .getAttribute('aria-selected'),
      'true',
    );
    assert.deepEqual(pages, [0]);
    assert.equal(outline.getCount(), 3);
  } finally {
    outline.dispose();
  }
});
test('PDF 默认展开阈值为 200，正文同步可显示折叠祖先内的节点', () => {
  for (const size of [200, 201]) {
    const outline = new PdfOutline(createDocument(), () => {});
    const entries = [
      node('a', 0, [node('b', 1, [node('c', 2)])]),
      ...Array.from({ length: size - 3 }, (_, index) =>
        node('x' + index, index + 3),
      ),
    ];
    try {
      outline.setEntries(entries);
      assert.equal(
        outline.element
          .querySelector('[data-outline-id="b"]')
          .getAttribute('aria-expanded'),
        String(size === 200),
      );
      outline.setCurrentPage(2);
      assert.equal(
        outline.element
          .querySelector('[data-outline-id="c"]')
          .getAttribute('aria-selected'),
        'true',
      );
    } finally {
      outline.dispose();
    }
  }
});
