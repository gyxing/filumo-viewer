import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const result = await build({
  entryPoints: ['packages/json/src/parser/scanJsonLines.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { scanJsonLines } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')
);
test('记录型 JSON 保留真实行号，错误行不影响合法标量', async () => {
  const text = ' \r\n{"a":1}\r\ninvalid\r\nnull\r\n',
    signal = new AbortController().signal;
  const parsed = await scanJsonLines(
    text,
    { maxRecords: 100, maxDepth: 256, maxNodes: 200000 },
    signal,
  );
  assert.equal(parsed.kind, 'ready');
  assert.deepEqual([...parsed.index.lineNumbers], [2, 3, 4]);
  assert.deepEqual([...parsed.index.valid], [1, 0, 1]);
  assert.equal(
    text.slice(parsed.index.starts[2], parsed.index.ends[2]),
    'null',
  );
  const invalid = await scanJsonLines(
    '1 2\n{\n"a":1\n}',
    { maxRecords: 100, maxDepth: 256, maxNodes: 200000 },
    signal,
  );
  assert.equal(
    invalid.index.valid.every((value) => value === 0),
    true,
  );
});
