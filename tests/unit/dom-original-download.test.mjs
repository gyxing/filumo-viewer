import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
const out = await build({
  entryPoints: ['packages/dom/src/shell/OriginalDownload.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  alias: { '@filumo/core': resolve('packages/core/src/index.ts') },
});
const { prepareOriginalDownload, originalDownloadAvailability } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(out.outputFiles[0].text).toString('base64')
);
test('宿主下载接管只执行一次，禁用默认物化，Blob 不复制全文', async () => {
  let reads = 0,
    handled = 0;
  const blob = new Blob(['sample']);
  const source = {
    readAll: async () => {
      reads++;
      return new Uint8Array();
    },
    readBlob: async () => blob,
    dispose: async () => {},
  };
  const signal = new AbortController().signal;
  assert.equal((await prepareOriginalDownload(source, signal)).blob, blob);
  assert.equal(reads, 0);
  await prepareOriginalDownload(
    source,
    signal,
    async () => {
      handled++;
    },
    { enabled: false },
  );
  assert.equal(handled, 1);
  assert.equal(reads, 0);
  await assert.rejects(
    prepareOriginalDownload(source, signal, undefined, {
      enabled: false,
      reason: '需要宿主下载',
    }),
    /需要宿主下载/,
  );
});
test('有效下载状态区分宿主接管、未就绪和停用，供嵌入查看器复用', () => {
  assert.equal(
    originalDownloadAvailability(true, true, false, {
      enabled: false,
      reason: 'limit',
    }).enabled,
    false,
  );
  assert.equal(
    originalDownloadAvailability(true, true, true, { enabled: false }).enabled,
    true,
  );
  assert.equal(originalDownloadAvailability(false, true, true).enabled, false);
  assert.equal(originalDownloadAvailability(true, false, true).enabled, false);
});
