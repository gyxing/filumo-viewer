import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const result = await build({
  entryPoints: ['packages/csv/src/view/CsvSelection.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { CsvSelection } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')
);
test('矩形选择独立于视口窗口，反向扩选保留锚点', () => {
  const selection = new CsvSelection();
  selection.select({ row: 1000, column: 20 }, false);
  selection.select({ row: 900, column: 10 }, true);
  assert.equal(selection.contains(950, 15), true);
  assert.equal(selection.contains(1001, 15), false);
  assert.deepEqual(selection.anchor, { row: 1000, column: 20 });
});
