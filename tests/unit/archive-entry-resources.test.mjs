import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const out = await build({
  entryPoints: ['packages/archive/src/view/EntryResources.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { EntryResources } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(out.outputFiles[0].text).toString('base64')
);
test('重复路径不任意选取，链接不触发提前提取，资源租约可释放', async () => {
  let reads = 0;
  const urls = [];
  const session = {
    bytes: async () => {
      reads++;
      return new Uint8Array([1]);
    },
  };
  const level = {
    entries: [
      { id: '1', path: 'images/a.png', kind: 'file', size: 1 },
      { id: '2', path: 'images/a.png', kind: 'file', size: 1 },
    ],
  };
  const resources = new EntryResources(
    session,
    level,
    'docs/readme.md',
    new AbortController().signal,
    {
      URL: {
        createObjectURL: () => {
          urls.push('blob:sample');
          return 'blob:sample';
        },
        revokeObjectURL: (url) => urls.splice(urls.indexOf(url), 1),
      },
    },
  );
  assert.equal(
    await resources.resources.resolveResource('../images/a.png', 'image'),
    undefined,
  );
  assert.equal(reads, 0);
  level.entries.pop();
  assert.equal(
    await resources.resources.resolveResource('../images/a.png', 'link'),
    undefined,
  );
  assert.equal(reads, 0);
  assert.equal(
    await resources.resources.resolveResource('../images/a.png', 'image'),
    'blob:sample',
  );
  assert.equal(reads, 1);
  resources.dispose();
  assert.equal(urls.length, 0);
});
