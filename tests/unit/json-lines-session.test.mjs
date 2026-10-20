import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
import { textSourceAliases } from './helpers/text-source-aliases.mjs';
const result = await build({
  stdin: {
    contents:
      "export {JsonLinesSession} from './packages/json/src/runtime/JsonLinesSession';export {scanJsonLines} from './packages/json/src/parser/scanJsonLines';export {scanJson} from './packages/json/src/parser/scanJson';",
    resolveDir: process.cwd(),
  },
  alias: textSourceAliases,
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { JsonLinesSession, scanJsonLines, scanJson } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')
);
test('JSONL 记录详情只保留三个最近结果且局部范围不加文件偏移', async () => {
  let calls = 0;
  const content = {
    document: { text: ' \r\n{"a":1}\r\n2\r\n3\r\n4\r\n' },
    revision: 1,
    async run(task, data, signal) {
      if (task === 'index-json-lines')
        return scanJsonLines(data.text, data, signal);
      calls++;
      return scanJson(data.text, data, signal);
    },
  };
  const session = new JsonLinesSession(content, { maxCachedRecords: 3 });
  for (let i = 0; i < 4; i++) {
    session.setCurrent(i);
    const parsed = await session.ensureRecord(i);
    assert.equal(parsed.kind, 'ready');
    assert.equal(parsed.document.nodes[0].start, 0);
  }
  assert.equal(calls, 4);
  session.setCurrent(0);
  const parsed = await session.ensureRecord(0);
  assert.equal(calls, 5);
  assert.equal(parsed.document.text, '{"a":1}');
  const indexed = await session.ensureIndex();
  assert.equal(indexed.index.starts[0], 3);
  session.dispose();
});
