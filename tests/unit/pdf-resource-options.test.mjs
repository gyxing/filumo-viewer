import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

const bundle = await build({
  entryPoints: ['packages/pdf/src/assets.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [
    {
      name: 'source-core-errors',
      setup(builder) {
        builder.onResolve({ filter: /^@filumo\/core$/ }, () => ({
          path: resolve('packages/core/src/errors.ts'),
        }));
      },
    },
  ],
});
const source = bundle.outputFiles[0].text.replaceAll(
  'import.meta.url',
  JSON.stringify('https://viewer.example/package/assets.js'),
);
const { resolvePdfAssets, createPdfWorker } = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
);

test('缺省地址保留包内位置，不默认使用 CDN', () => {
  const assets = resolvePdfAssets();
  assert.equal(
    assets.cMap,
    'https://viewer.example/package/assets/pdfjs/cmaps/',
  );
  assert.equal(
    assets.standardFonts,
    'https://viewer.example/package/assets/pdfjs/standard_fonts/',
  );
  assert.equal(
    assets.wasm,
    'https://viewer.example/package/assets/pdfjs/wasm/',
  );
  assert.equal(assets.icc, 'https://viewer.example/package/assets/pdfjs/iccs/');
});

test('单项覆盖优先于整套根目录，根目录查询参数保留在派生资源上', () => {
  const assets = resolvePdfAssets({
    assetsBaseUrl: 'https://assets.example/pdf?token=fixture',
    cMapUrl: 'https://fonts.example/maps',
    standardFontDataUrl: '/fonts',
    wasmUrl: '/wasm',
    iccUrl: '/iccs',
    workerSrc: '/workers/custom.js',
    useWasm: false,
  });
  assert.equal(assets.cMap, 'https://fonts.example/maps/');
  assert.equal(assets.standardFonts, 'https://viewer.example/fonts/');
  assert.equal(assets.wasm, 'https://viewer.example/wasm/');
  assert.equal(assets.icc, 'https://viewer.example/iccs/');
  assert.equal(
    assets.display,
    'https://assets.example/pdf/legacy/build/pdf.mjs?token=fixture',
  );
  assert.equal(
    assets.textLayerCss,
    'https://assets.example/pdf/text-layer.css?token=fixture',
  );
  assert.equal(assets.worker, 'https://viewer.example/workers/custom.js');
});

test('相对资源以宿主页面为基准，不受模块文件位置影响', () => {
  const previous = globalThis.document;
  globalThis.document = { baseURI: 'https://app.example/sub/viewer/' };
  try {
    assert.equal(
      resolvePdfAssets({ cMapUrl: '../maps' }).cMap,
      'https://app.example/sub/maps/',
    );
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test('非法覆盖值明确报错，不将空值当成禁用或自动切换 CDN', () => {
  for (const field of [
    'assetsBaseUrl',
    'cMapUrl',
    'standardFontDataUrl',
    'wasmUrl',
    'iccUrl',
  ]) {
    for (const value of [
      '',
      '  ',
      null,
      42,
      'javascript:alert(1)',
      'data:text/plain,test',
    ]) {
      assert.throws(
        () => resolvePdfAssets({ [field]: value }),
        /资源地址|不受支持/,
      );
    }
  }
  assert.throws(() => resolvePdfAssets({ useWasm: 'false' }), /useWasm/);
  assert.throws(
    () => resolvePdfAssets({ workerFactory: false }),
    /workerFactory/,
  );
});

test('Worker 工厂优先于 URL；默认 Worker 使用包内模块入口', () => {
  const previous = globalThis.Worker;
  const created = [];
  globalThis.Worker = class {
    constructor(url, options) {
      created.push({ url: String(url), options });
    }
  };
  try {
    const custom = {};
    assert.equal(
      createPdfWorker(
        { workerFactory: () => custom },
        resolvePdfAssets({ workerSrc: '/ignored.js' }),
      ),
      custom,
    );
    createPdfWorker({}, resolvePdfAssets());
    assert.equal(
      created[0].url,
      'https://viewer.example/package/generated/worker.js',
    );
    createPdfWorker(
      { workerSrc: '/custom.js' },
      resolvePdfAssets({ workerSrc: '/custom.js' }),
    );
    assert.equal(created[1].url, 'https://viewer.example/custom.js');
    assert.equal(created[0].options.type, 'module');
  } finally {
    if (previous === undefined) delete globalThis.Worker;
    else globalThis.Worker = previous;
  }
});
