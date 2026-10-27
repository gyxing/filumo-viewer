import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
test('安装产物有独立资源入口、WASM 和许可，描述符不导入引擎', async () => {
  const manifest = JSON.parse(
    await readFile('packages/archive/package.json', 'utf8'),
  );
  assert.ok(manifest.exports['./assets']);
  assert.equal(manifest.dependencies['libarchive-wasm'], '1.2.0');
  const build = JSON.parse(
    await readFile('packages/archive/dist/build-manifest.json', 'utf8'),
  );
  assert.ok(build.archiveAssets.assets.some((a) => a.role === 'wasm'));
  for (const asset of build.archiveAssets.assets)
    await readFile('packages/archive/dist/' + asset.file);
  const descriptor = await readFile(
    'packages/archive/src/descriptor.ts',
    'utf8',
  );
  assert.doesNotMatch(descriptor, /import\s+.*(?:libarchive-wasm|ZipReader)/);
});
