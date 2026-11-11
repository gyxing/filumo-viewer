import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
const descriptor = await build({
  entryPoints: ['packages/archive/src/zip.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  external: ['./runtime/openArchive', './view/mountArchive'],
});
const { zip } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(descriptor.outputFiles[0].text).toString('base64')
);

test('ZIP 专用描述符只接收 ZIP，不抢占 Office 或其他压缩格式', async () => {
  const plugin = zip({
    workerFactory: () => assert.fail('注册不能提前创建 Worker'),
  });
  assert.deepEqual(plugin.document.extensions, ['.zip']);
  const signal = new AbortController().signal;
  assert.equal(
    await plugin.document.detect({ name: 'batch.zip' }, signal),
    true,
  );
  assert.equal(
    await plugin.document.detect({ name: 'document.xlsx' }, signal),
    false,
  );
  assert.equal(
    await plugin.document.detect({ name: 'archive.7z' }, signal),
    false,
  );
});

test('ZIP Worker 依赖图排除其他读取后端与 libarchive WASM', async () => {
  const result = await build({
    entryPoints: ['packages/archive/src/worker/zip-entry.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    metafile: true,
    alias: { '@filumo/core': resolve('packages/core/src/index.ts') },
  });
  const inputs = Object.keys(result.metafile.inputs)
    .join('\n')
    .replaceAll('\\', '/');
  assert.match(inputs, /reader\/zip\/ZipReader/);
  assert.doesNotMatch(inputs, /reader\/(?:wasm|gzip|tar)\//);
  assert.doesNotMatch(inputs, /libarchive-wasm/);
});
