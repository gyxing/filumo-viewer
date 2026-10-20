import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument } from './helpers/reading-dom.mjs';
const bundle = await build({
  stdin: {
    contents: `export {PdfPageLayout} from './packages/pdf/src/view/PdfPageLayout'; export {PdfRenderQueue} from './packages/pdf/src/view/PdfRenderQueue'; export {PdfCanvasCache} from './packages/pdf/src/view/PdfCanvasCache'; export {PdfSearch} from './packages/pdf/src/view/PdfSearch';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { PdfPageLayout, PdfRenderQueue, PdfCanvasCache, PdfSearch } =
  await import(
    'data:text/javascript;base64,' +
      Buffer.from(bundle.outputFiles[0].text).toString('base64')
  );
test('混合尺寸及千页布局修正保留页内锚点', () => {
  const layout = new PdfPageLayout(1000, {
    width: 600,
    height: 800,
    rotation: 0,
  });
  const anchor = { pageIndex: 800, ratio: 0.4 };
  layout.setMetrics(100, { width: 800, height: 600, rotation: 0 });
  assert.equal(layout.findPage(layout.restoreAnchor(anchor)), 800);
  layout.setScale(2);
  layout.setRotation(90);
  const restored = layout.restoreAnchor(anchor),
    captured = layout.captureAnchor(restored);
  assert.equal(captured.pageIndex, 800);
  assert.ok(Math.abs(captured.ratio - 0.4) < 1e-8);
});
test('阅读线区分同页位置，缩放旋转和到底时仍能匹配对应页面', () => {
  const layout = new PdfPageLayout(3, { width: 600, height: 800, rotation: 0 });
  assert.deepEqual(layout.captureReadingPosition(0, 400), {
    pageIndex: 0,
    ratio: 0.04,
  });
  assert.deepEqual(layout.captureReadingPosition(128, 400), {
    pageIndex: 0,
    ratio: 0.2,
  });
  assert.deepEqual(layout.captureReadingPosition(368, 400), {
    pageIndex: 0,
    ratio: 0.5,
  });
  layout.setMetrics(1, { width: 800, height: 600, rotation: 0 });
  layout.setScale(2);
  layout.setRotation(90);
  const top = layout.offsetOf(1) + layout.getSize(1).height * 0.4 - 48;
  const position = layout.captureReadingPosition(top, 400);
  assert.equal(position.pageIndex, 1);
  assert.ok(Math.abs(position.ratio - 0.4) < 1e-8);
  assert.deepEqual(
    layout.captureReadingPosition(layout.totalHeight() - 400, 400),
    { pageIndex: 2, ratio: 1 },
  );
});
test('混合尺寸修正保留阅读线所属页面和位置，不因前方页高度修正反复跨页', () => {
  const layout = new PdfPageLayout(12, {
    width: 600,
    height: 800,
    rotation: 0,
  });
  layout.setScale(1.5);
  const top = layout.offsetOf(7) + 120;
  const before = layout.captureReadingPosition(top, 400);
  const anchor = layout.captureAnchor(top);
  layout.setMetrics(2, { width: 800, height: 500, rotation: 0 });
  layout.setMetrics(5, { width: 600, height: 1050, rotation: 0 });
  const restored = layout.restoreAnchor(anchor);
  assert.notEqual(restored, top);
  const after = layout.captureReadingPosition(restored, 400);
  assert.equal(after.pageIndex, before.pageIndex);
  assert.ok(Math.abs(after.ratio - before.ratio) < 1e-8);
});

test('页面队列限制并发并取消旧代次', async () => {
  const queue = new PdfRenderQueue(2);
  let active = 0,
    max = 0;
  queue.updateWindow([0, 1], [2, 3, 4], 1);
  const jobs = [0, 1, 2, 3, 4].map((page) =>
    queue.enqueue(String(page), page, 1, async (signal) => {
      active++;
      max = Math.max(max, active);
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 1);
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(signal.reason);
            },
            { once: true },
          );
        });
      } finally {
        active--;
      }
    }),
  );
  await Promise.all(jobs);
  assert.equal(max, 2);
  assert.equal(active, 0);
  await queue.dispose();
});
test('画布预算不回收有租约条目，归还后可淘汰且销毁归零', () => {
  const cache = new PdfCanvasCache(createDocument(), 800),
    a = cache.acquire('a', 10, 10),
    b = cache.acquire('b', 10, 10);
  assert.throws(() => cache.acquire('c', 10, 10), {
    code: 'PDF_CANVAS_BUDGET',
  });
  a.release();
  const c = cache.acquire('c', 10, 10);
  assert.equal(a.canvas.width, 0);
  b.release();
  c.release();
  cache.dispose();
  assert.equal(b.canvas.width, 0);
  assert.equal(c.canvas.height, 0);
});
test('PDF 查找按文本逐页扫描并限制匹配明细，停用不开始扫描', async () => {
  let reads = 0;
  const backend = {
    pageCount: 3,
    readText: async () => {
      reads++;
      return { text: 'aa aa aa', runs: [] };
    },
    cleanupPage: async () => {},
  };
  const search = new PdfSearch(backend, {
    maxSearchMatches: 3,
    textCacheBytes: 32,
  });
  try {
    await search.setQuery('aa');
    assert.equal(search.getSnapshot().resultCount, 3);
    assert.equal(search.getSnapshot().truncated, true);
    assert.equal(reads, 1);
    search.setActive(false);
    await search.setQuery('different');
    assert.equal(reads, 1);
  } finally {
    search.dispose();
  }
});
