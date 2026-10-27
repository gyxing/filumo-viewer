import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const out = await build({
  entryPoints: ['packages/archive/src/reader/archivePath.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { archivePath, relativeEntryPath } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(out.outputFiles[0].text).toString('base64')
);
test('虚拟路径不允许访问归档外部，正常相邻资源保留', () => {
  for (const path of ['/a', 'C:/a', '../../a', '\\server\\a', 'x\0'])
    assert.throws(() => archivePath(path));
  assert.equal(
    relativeEntryPath('docs/readme.html', '../images/a.png'),
    'images/a.png',
  );
  assert.equal(relativeEntryPath('readme.html', '../a.png'), undefined);
  assert.equal(
    relativeEntryPath('readme.html', 'https://example.test/a'),
    undefined,
  );
});
