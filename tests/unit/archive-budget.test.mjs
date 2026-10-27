import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
const out = await build({
  entryPoints: ['packages/archive/src/reader/ArchiveBudget.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  alias: { '@filumo/core': resolve('packages/core/src/index.ts') },
});
const { ArchiveBudget } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(out.outputFiles[0].text).toString('base64')
);
test('累计输出不能通过重复提取重置，默认嵌套最大到 2', () => {
  const b = new ArchiveBudget({ maxTotalUncompressedBytes: 5 });
  b.consume(3);
  assert.throws(() => b.consume(3));
  b.depth(2);
  assert.throws(() => b.depth(3));
  assert.throws(() => new ArchiveBudget({ maxEntryBytes: -1 }));
});
