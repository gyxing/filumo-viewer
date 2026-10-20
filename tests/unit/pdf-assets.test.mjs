import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { extractPdfTextLayerCss } from '../../scripts/build/pdf-assets.mjs';

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
          builder.onResolve({ filter: /^@fivo\/pdf\/assets$/ }, () => ({
            path: 'assets',
            namespace: 'fixture',
          }));
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
            loader: 'js',
            contents: `import {resolvePdfAssets as resolve} from ${JSON.stringify(
              resolve('packages/pdf/src/assets.ts'),
            )};export function resolvePdfAssets(options){return resolve(options,'file:///D:/workspace/packages/pdf/src/assets.ts');}`,
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
      assetsBaseUrl: '/sub/fivo-assets/pdf/assets/pdfjs/',
      workerSrc: './custom-worker.mjs',
    });
    assert.equal(
      assets.display,
      'https://viewer.example/sub/fivo-assets/pdf/assets/pdfjs/legacy/build/pdf.mjs',
    );
    assert.equal(
      assets.worker,
      'https://viewer.example/sub/dev/custom-worker.mjs',
    );
    assert.equal(
      assets.cMap,
      'https://viewer.example/sub/fivo-assets/pdf/assets/pdfjs/cmaps/',
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
    'fivo-pdf-v1',
  );
  assert.ok(css.includes('.fivo-pdf-v1'));
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
