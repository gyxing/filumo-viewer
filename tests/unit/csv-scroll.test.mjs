import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const result = await build({
  entryPoints: ['packages/csv/src/view/csvViewport.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { csvScrollMetrics } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')
);
test('百万行在 300% 下仍可通过有限轨道到达末端', () => {
  const metrics = csvScrollMetrics(1000000, 84, 600);
  assert.equal(metrics.physicalHeight, 8000000);
  assert.equal(
    (metrics.physicalHeight - 516) * metrics.ratio,
    metrics.logicalHeight - 516,
  );
  assert.equal(csvScrollMetrics(100, 28, 600).ratio, 1);
});
