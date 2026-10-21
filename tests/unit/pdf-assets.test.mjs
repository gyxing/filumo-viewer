import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  adaptPdfWorker,
  extractPdfTextLayerCss,
} from '../../scripts/build/pdf-assets.mjs';

test('PDF 显式资源路径使用页面地址，不受打包器的源码 file URL 影响', async () => {
  const bundle = await build({
    entryPoints: ['packages/pdf/src/runtime/pdfAssets.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    plugins: [
      {
        name: 'file-based-assets',
        setup(builder) {
          builder.onResolve({ filter: new RegExp('^@filumo/core$') }, () => ({
            path: resolve('packages/core/src/errors.ts'),
          }));
          builder.onResolve({ filter: /^@filumo\/pdf\/assets$/ }, () => ({
            path: 'assets',
            namespace: 'fixture',
          }));
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
            loader: 'js',
            contents: `import {resolvePdfAssets as resolve, PDF_BUNDLED_ASSET_BASE} from ${JSON.stringify(
              resolve('packages/pdf/src/assets.ts'),
            )};export {PDF_BUNDLED_ASSET_BASE};export function resolvePdfAssets(options){return resolve(options,'file:///D:/workspace/packages/pdf/src/assets.ts');}`,
          }));
        },
      },
    ],
  });
  const { getPdfAssets } = await import(
    'data:text/javascript;base64,' +
      Buffer.from(bundle.outputFiles[0].text).toString('base64')
  );
  const previous = globalThis.document;
  globalThis.document = {
    baseURI: 'https://viewer.example/sub/dev/smoke-test',
  };
  try {
    const assets = await getPdfAssets({
      assetsBaseUrl: '/sub/filumo-assets/pdf/assets/pdfjs/',
      workerSrc: './custom-worker.mjs',
    });
    assert.equal(
      assets.display,
      'https://viewer.example/sub/filumo-assets/pdf/assets/pdfjs/legacy/build/pdf.mjs',
    );
    assert.equal(
      assets.worker,
      'https://viewer.example/sub/dev/custom-worker.mjs',
    );
    assert.equal(
      assets.cMap,
      'https://viewer.example/sub/filumo-assets/pdf/assets/pdfjs/cmaps/',
    );
    const remote = await getPdfAssets({
      assetsBaseUrl: 'https://assets.example/pdf/',
    });
    assert.equal(
      remote.display,
      'https://assets.example/pdf/legacy/build/pdf.mjs',
    );
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
test('文字层 CSS 提取保留嵌套规则，不带入其他 Viewer 样式', () => {
  const css = extractPdfTextLayerCss(
    'body { color:red; } .textLayer { --x: "}"; /* { } */ span { color:transparent; } } .other {color:blue}',
    'filumo-pdf-v1',
  );
  assert.ok(css.includes('.filumo-pdf-v1'));
  assert.ok(css.includes('span { color:transparent; }'));
  assert.equal(css.includes('body {'), false);
  assert.equal(css.includes('.other'), false);
});
test('PDF 发行清单含引擎、Worker、辅助资源和许可', async () => {
  const manifest = JSON.parse(
    await readFile('packages/pdf/dist/build-manifest.json', 'utf8'),
  );
  assert.equal(manifest.pdfAssets.version, '6.4.299');
  for (const role of ['engine', 'worker', 'auxiliary', 'style', 'license'])
    assert.ok(
      manifest.pdfAssets.assets.some((asset) => asset.role === role),
      role,
    );
  for (const asset of manifest.pdfAssets.assets)
    await readFile('packages/pdf/dist/' + asset.file);
});

test('同版 Worker 为同步、异步资源和解码回退生成明确入口', async () => {
  const upstream = [
    '/* fixture-start */',
    'async function fetchBinaryData(url) { return url; }',
    'function fetchSync(url) { return url; }',
    'class WasmImage { static #wasmUrl; async #getJsModule() {',
    'const mod = await import(/*webpackIgnore: true*/ /*@vite-ignore*/ ' +
      String.fromCharCode(96, 36) +
      '{WasmImage.#wasmUrl}' +
      String.fromCharCode(36) +
      '{this._noWasmFilename}' +
      String.fromCharCode(96) +
      ');',
    'return mod; } }',
  ].join('\n');
  const adapted = adaptPdfWorker(upstream, [
    { file: 'assets/pdfjs/cmaps/Test.bcmap', role: 'auxiliary' },
    { file: 'assets/pdfjs/wasm/qcms_bg.wasm', role: 'auxiliary' },
    { file: 'assets/pdfjs/iccs/Test.icc', role: 'auxiliary' },
  ]);
  const prefix = adapted
    .slice(0, adapted.indexOf('/* fixture-start */'))
    .replaceAll(
      'import.meta.url',
      JSON.stringify('https://viewer.example/pdf/worker.js'),
    );
  const { resolve } = await import(
    'data:text/javascript;base64,' +
      Buffer.from(
        prefix + '\nexport { __filumoResolvePdfResource as resolve };',
      ).toString('base64')
  );
  assert.equal(
    resolve('filumo-pdf://bundled/cmaps/Test.bcmap'),
    'https://viewer.example/pdf/assets/pdfjs/cmaps/Test.bcmap',
  );
  assert.equal(
    resolve('filumo-pdf://bundled/wasm/qcms_bg.wasm'),
    'https://viewer.example/pdf/assets/pdfjs/wasm/qcms_bg.wasm',
  );
  assert.equal(
    resolve('filumo-pdf://bundled/iccs/Test.icc'),
    'https://viewer.example/pdf/assets/pdfjs/iccs/Test.icc',
  );
  const external =
    'filumo-pdf://external/' +
    encodeURIComponent('https://cdn.example/cmaps/?token=fixture') +
    '/';
  assert.equal(
    resolve(external + 'Test.bcmap'),
    'https://cdn.example/cmaps/Test.bcmap?token=fixture',
  );
  assert.throws(
    () => resolve('filumo-pdf://bundled/cmaps/missing.bcmap'),
    /缺少包内/,
  );
  assert.throws(() => resolve(external + '../private'), /越界/);
  assert.ok(adapted.includes('__filumoLoadPdfFallback(WasmImage.#wasmUrl'));
  assert.throws(
    () =>
      adaptPdfWorker(
        upstream.replace('function fetchSync(url)', 'function changed(url)'),
        [],
      ),
    /入口不唯一/,
  );
});
