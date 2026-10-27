import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
const require = createRequire(resolve('packages/archive/package.json'));
const root = dirname(require.resolve('libarchive-wasm'));
const folder = resolve('tmp/diagnostics/code-html-archive/wasm-tests');
await mkdir(folder, { recursive: true });
const output = await build({
  stdin: {
    contents:
      "export {WasmArchiveReader} from './packages/archive/src/reader/wasm/WasmArchiveReader'; export {ArchiveBudget} from './packages/archive/src/reader/ArchiveBudget'; export {normalizeSource} from './packages/core/src/index';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  alias: {
    '@filumo/core': resolve('packages/core/src/index.ts'),
    '@filumo/archive/assets': resolve('packages/archive/src/assets.ts'),
  },
  plugins: [
    {
      name: 'installed-wasm',
      setup(b) {
        b.onResolve({ filter: /^libarchive-wasm$/ }, () => ({
          path: pathToFileURL(require.resolve('libarchive-wasm')).href,
          external: true,
        }));
      },
    },
  ],
});
const file = folder + '/module.mjs';
await writeFile(
  file,
  "import {createRequire} from 'node:module'; globalThis.require=createRequire(import.meta.url);\n" +
    'globalThis.__dirname=' +
    JSON.stringify(root) +
    ';globalThis.__filename=' +
    JSON.stringify(root + '/libarchive.js') +
    ';\n' +
    output.outputFiles[0].text,
);
const { WasmArchiveReader, ArchiveBudget, normalizeSource } = await import(
  pathToFileURL(file).href
);
test('固定发行引擎实际读取 RAR v4/v5、7z、TAR.XZ，逐条目提取', async () => {
  for (const [name, format] of [
    ['sample-v4.rar', 'rar'],
    ['sample-v5.rar', 'rar'],
    ['sample.7z', '7z'],
    ['sample.tar.xz', 'tarxz'],
  ]) {
    const bytes = await readFile(
        'tests/fixtures/public/archive/vendor/' + name,
      ),
      source = await normalizeSource(new File([bytes], name)),
      signal = new AbortController().signal;
    const reader = new WasmArchiveReader({
      source,
      format,
      budget: new ArchiveBudget(),
      signal,
      assetsBaseUrl: pathToFileURL(root + '/').href,
    });
    try {
      const entries = [];
      for await (const entry of reader.scan(signal)) entries.push(entry);
      assert.ok(entries.length > 0, name);
      const target = entries.find((e) => e.kind === 'file' && e.size > 0);
      assert.ok(target, name);
      const content = await new Response(
        await reader.openEntry(target.id, signal),
      ).arrayBuffer();
      assert.equal(content.byteLength, target.size, name);
    } finally {
      await reader.close();
      await source.dispose();
    }
  }
});
test('WASM 超限在加载和读取前拒绝', async () => {
  let read = false;
  const source = {
    name: 'too-big.rar',
    size: 65 * 1024 * 1024,
    readAll: async () => {
      read = true;
      return new Uint8Array();
    },
    dispose: async () => {},
  };
  const reader = new WasmArchiveReader({
    source,
    format: 'rar',
    budget: new ArchiveBudget(),
    signal: new AbortController().signal,
  });
  await assert.rejects(async () => {
    for await (const entry of reader.scan(new AbortController().signal))
      void entry;
  }, /上限|限制/);
  assert.equal(read, false);
  await reader.close();
});
test('WASM 扫描固实内容也按实际输出消耗预算，不能只给提取计费', async () => {
  const bytes = await readFile(
      'tests/fixtures/public/archive/vendor/sample.7z',
    ),
    source = await normalizeSource(new File([bytes], 'sample.7z')),
    signal = new AbortController().signal,
    budget = new ArchiveBudget({ maxTotalUncompressedBytes: 1 }),
    reader = new WasmArchiveReader({
      source,
      format: '7z',
      budget,
      signal,
      assetsBaseUrl: pathToFileURL(root + '/').href,
    });
  try {
    await assert.rejects(async () => {
      for await (const entry of reader.scan(signal)) void entry;
    }, /累计解压量/);
  } finally {
    await reader.close();
    await source.dispose();
  }
});
