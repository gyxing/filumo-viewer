import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const result = await build({
  entryPoints: ['packages/json/src/parser/scanJson.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { scanJson } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')
);
test('JSONC 保留原文位置与重复键，严格 JSON 不接受注释和尾逗号', async () => {
  const text = '{ /* 注释 */ "x":"//原文", "x":2, }',
    signal = new AbortController().signal;
  const options = { maxDepth: 256, maxNodes: 200000 };
  assert.equal((await scanJson(text, options, signal)).kind, 'invalid');
  const parsed = await scanJson(text, { ...options, variant: 'jsonc' }, signal);
  assert.equal(parsed.kind, 'ready');
  const values = parsed.document.nodes.filter(
    (node) => node.type === 'property',
  );
  assert.equal(values.length, 2);
  assert.equal(parsed.document.diagnostics.length, 1);
  assert.equal(
    text.slice(values[1].keyRange.start, values[1].keyRange.end),
    '"x"',
  );
  assert.equal(
    (await scanJson('{x:1}', { ...options, variant: 'jsonc' }, signal)).kind,
    'invalid',
  );
});
