import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { createDocument } from './helpers/reading-dom.mjs';

const bundle = await build({
  stdin: {
    contents:
      "export {PdfCanvasCache} from './packages/pdf/src/view/PdfCanvasCache';export {PdfPageView} from './packages/pdf/src/view/PdfPageView';export {PdfViewport} from './packages/pdf/src/view/PdfViewport';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  alias: { '@filumo/core': resolve('packages/core/src/index.ts') },
  plugins: [
    {
      name: 'styles',
      setup(builder) {
        builder.onLoad({ filter: /\.less$/ }, () => ({
          contents: '',
          loader: 'js',
        }));
      },
    },
  ],
});
const { PdfCanvasCache, PdfPageView, PdfViewport } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
const tick = () => new Promise((resolve) => setImmediate(resolve));

/** 只补浏览器平台能力，页面、缓存及队列仍运行真实生产实现。 */
function fixture(options = { zoom: 100 }) {
  const document = createDocument(),
    frames = new Map();
  let nextFrame = 0,
    renders = 0;
  const create = document.createElement;
  document.createElement = (...args) => {
    const node = create(...args);
    node.clientWidth = 640;
    node.clientHeight = 400;
    node.removeAttribute = (name) => node.attributes.delete(name);
    return node;
  };
  document.defaultView = {
    devicePixelRatio: 1,
    requestAnimationFrame(callback) {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    getSelection: () => null,
  };
  const backend = {
    pageCount: 2,
    getMetrics: async () => ({ width: 600, height: 800, rotation: 0 }),
    render: () => {
      renders++;
      return { promise: Promise.resolve(), cancel() {} };
    },
    mountLayers: async () => ({ dispose: async () => {} }),
    cleanupPage: async () => {},
  };
  const session = {
    options: { canvasCacheBytes: 40000 },
    setFirstPageReady() {},
  };
  const controller = new AbortController();
  const viewport = new PdfViewport(
    document.createElement('div'),
    backend,
    session,
    {
      options,
      session: { signal: controller.signal },
      onError(error) {
        throw error;
      },
    },
    () => {},
    { width: 600, height: 800, rotation: 0 },
  );
  const flush = async (count = 3) => {
    for (let round = 0; round < count; round++) {
      const current = [...frames.values()];
      frames.clear();
      current.forEach((callback) => callback(0));
      await tick();
    }
  };
  return {
    document,
    backend,
    viewport,
    flush,
    get renders() {
      return renders;
    },
  };
}

test('PDF自动上限100允许手动150，普通配置更新和旋转保持手动模式', async () => {
  const f = fixture({ zoomMode: 'fit-width', fitMaxZoom: 100 });
  try {
    assert.ok(f.viewport.getSnapshot().zoom < 100);
    f.viewport.element.clientWidth = 1600;
    f.viewport.fitWidth();
    assert.equal(f.viewport.getSnapshot().zoom, 100);
    f.viewport.setZoom(150);
    f.viewport.update({ locale: 'en-US', fitMaxZoom: 80 });
    f.viewport.rotate();
    assert.equal(f.viewport.getSnapshot().mode, 'percentage');
    assert.equal(f.viewport.getSnapshot().zoom, 150);
    f.viewport.fitWidth();
    assert.equal(f.viewport.getSnapshot().zoom, 80);
    f.viewport.element.clientWidth = 432;
    f.viewport.fitWidth();
    assert.ok(f.viewport.getSnapshot().zoom < 80);
    f.viewport.update({ zoomMode: 'percentage', zoom: 100 });
    assert.equal(f.viewport.getSnapshot().zoom, 100);
    f.viewport.setZoom(150);
    f.viewport.update({ zoomMode: 'percentage', zoom: 100, locale: 'zh-CN' });
    assert.equal(f.viewport.getSnapshot().zoom, 150);
  } finally {
    await f.viewport.dispose();
  }
});

test('最后一个租约归还才发布容量版本，通知异步合并且 release 幂等', async () => {
  const cache = new PdfCanvasCache(createDocument(), 4);
  const first = cache.acquire('shared', 1, 1),
    second = cache.acquire('shared', 1, 1);
  let notifications = 0;
  const stop = cache.subscribeAvailable(() => {
    notifications++;
  });
  try {
    const before = cache.revision;
    first.release();
    await tick();
    assert.equal(cache.revision, before);
    assert.equal(notifications, 0);
    second.release();
    second.release();
    assert.equal(cache.revision, before + 1);
    assert.equal(notifications, 0);
    await tick();
    assert.equal(notifications, 1);
    const next = cache.acquire('next', 1, 1);
    assert.equal(notifications, 1);
    next.release();
  } finally {
    stop();
    cache.dispose();
  }
});

test('页面明确报告预算等待，释放后实际绘制并返回成功', async () => {
  const f = fixture();
  const cache = new PdfCanvasCache(f.document, 4);
  const held = cache.acquire('held', 1, 1);
  const page = new PdfPageView(
    0,
    f.document,
    f.backend,
    cache,
    {},
    () => {},
    () => {},
    () => {},
    () => {},
  );
  try {
    assert.equal(
      await page.render('page', 1, 0, new AbortController().signal, 1),
      'budget',
    );
    assert.equal(f.renders, 0);
    held.release();
    assert.equal(
      await page.render('page', 1, 0, new AbortController().signal, 1),
      'rendered',
    );
    assert.equal(f.renders, 1);
  } finally {
    held.release();
    await page.dispose();
    cache.dispose();
    await f.viewport.dispose();
  }
});

test('预算不变的调度不重复申请，归还租约无需滚动即可恢复', async () => {
  const f = fixture(),
    cache = f.viewport.cache;
  const held = cache.acquire('external', 100, 100);
  let attempts = 0;
  const acquire = cache.acquire.bind(cache);
  cache.acquire = (...args) => {
    attempts++;
    return acquire(...args);
  };
  try {
    await f.flush();
    assert.equal(f.renders, 0);
    const before = attempts;
    for (let i = 0; i < 5; i++) {
      f.viewport.update({});
      await f.flush(1);
    }
    assert.equal(attempts, before);
    held.release();
    await tick();
    await f.flush(5);
    assert.ok(f.renders > 0);
  } finally {
    held.release();
    await f.viewport.dispose();
  }
});

test('等待缩略图不占队列槽，释放后恢复并交付真实画布', async () => {
  const f = fixture(),
    cache = f.viewport.cache;
  const held = cache.acquire('external', 100, 100);
  await f.flush();
  let state = 'waiting';
  const pending = f.viewport.thumbnail(0, new AbortController().signal).then(
    (lease) => {
      state = 'ready';
      return lease;
    },
    (error) => {
      state = 'failed';
      return error;
    },
  );
  try {
    await f.flush();
    let otherRan = false;
    await f.viewport.queue.enqueue(
      'other',
      0,
      f.viewport.generation,
      async () => {
        otherRan = true;
      },
    );
    assert.equal(otherRan, true);
    assert.equal(state, 'waiting');
    held.release();
    await tick();
    await f.flush(5);
    const lease = await pending;
    assert.equal(state, 'ready');
    assert.ok(lease.canvas.width > 0);
    lease.dispose();
  } finally {
    held.release();
    await f.viewport.dispose();
    await pending;
  }
});

test('订阅前容量已变化不会丢失唤醒，暂停会取消新的预算等待', async () => {
  const f = fixture(),
    cache = f.viewport.cache;
  const held = cache.acquire('external', 100, 100);
  try {
    const revision = cache.revision;
    held.release();
    await f.viewport.waitForBudget(
      revision,
      new AbortController().signal,
      f.viewport.generation,
    );
    const pending = f.viewport.waitForBudget(
      cache.revision,
      new AbortController().signal,
      f.viewport.generation,
    );
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    f.viewport.setActive(false);
    await rejected;
  } finally {
    held.release();
    await f.viewport.dispose();
  }
});

test('销毁取消等待中的缩略图，迟到释放不重新绘制', async () => {
  const f = fixture(),
    cache = f.viewport.cache;
  const held = cache.acquire('external', 100, 100);
  await f.flush();
  const pending = f.viewport.thumbnail(0, new AbortController().signal);
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await f.flush();
  await f.viewport.dispose();
  held.release();
  await rejected;
  await tick();
  await f.flush();
  assert.equal(f.renders, 0);
});
