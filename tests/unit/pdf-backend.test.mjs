import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const bundle = await build({
  entryPoints: ['packages/pdf/src/runtime/PdfBackend.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { createPdfBackend } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

test('书签保留 XYZ/FitH 页内坐标，读取大纲不提前加载全部页面', async () => {
  let reads = 0;
  const page = {
    rotate: 0,
    getViewport: () => ({
      width: 600,
      height: 800,
      viewBox: [0, 0, 600, 800],
      convertToViewportPoint: (x, y) => [x, 800 - y],
    }),
    cleanup: () => true,
  };
  const backend = createPdfBackend(
    {
      numPages: 2,
      getPage: async () => {
        reads++;
        return page;
      },
      getOutline: async () => [
        { title: '章节', dest: [0, { name: 'XYZ' }, 20, 640, null] },
        { title: '子节', dest: 'section' },
        { title: '整页', dest: [1, { name: 'Fit' }] },
      ],
      getDestination: async () => [0, { name: 'FitH' }, 320],
    },
    {},
    {},
    new AbortController().signal,
  );
  try {
    const entries = await backend.readOutline(new AbortController().signal);
    assert.equal(reads, 0);
    assert.deepEqual(entries[0].destination, { left: 20, top: 640 });
    assert.deepEqual(entries[1].destination, { top: 320 });
    assert.equal(entries[2].destination, undefined);
    assert.equal(
      await backend.getOutlineOffset(
        0,
        entries[0].destination,
        0,
        new AbortController().signal,
      ),
      0.2,
    );
    assert.equal(
      await backend.getOutlineOffset(
        0,
        entries[1].destination,
        0,
        new AbortController().signal,
      ),
      0.6,
    );
  } finally {
    await backend.dispose();
  }
});
test('文字矩形使用当前 PDF.js 的点转换接口，不依赖已移除的矩形接口', async () => {
  const page = {
    getViewport: () => ({
      width: 600,
      height: 800,
      convertToViewportPoint: (x, y) => [x, 800 - y],
    }),
    getTextContent: async () => ({
      items: [
        {
          str: 'fixture',
          transform: [1, 0, 0, 1, 10, 20],
          width: 30,
          height: 12,
        },
      ],
      styles: {},
    }),
  };
  const backend = createPdfBackend(
    { numPages: 1, getPage: async () => page },
    {},
    {},
    new AbortController().signal,
  );
  try {
    const text = await backend.readText(0, new AbortController().signal);
    assert.equal(text.text, 'fixture');
    assert.deepEqual(text.runs[0].rect, [10, 768, 40, 780]);
  } finally {
    await backend.dispose();
  }
});
