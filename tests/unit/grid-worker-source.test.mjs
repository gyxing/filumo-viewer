import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';

const bundle = await build({
  entryPoints: [
    'packages/office/src/engine/parsing/runtime/source/WorkerSpreadsheetSource.ts',
  ],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { WorkerSpreadsheetSource } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

test('Worker 准备工作表时缓存合并元数据，选择查询不读取单元格或重复 RPC', async () => {
  const calls = [];
  const merge = { startRow: 1, endRow: 2, startColumn: 1, endColumn: 3 };
  const client = {
    subscribe: () => () => undefined,
    subscribeFailure: () => () => undefined,
    async request(operation) {
      calls.push(operation);
      return operation === 'get-sheet-merges' ? [merge] : undefined;
    },
    async dispose() {},
  };
  const source = new WorkerSpreadsheetSource(client, {
    kind: 'xlsx',
    snapshot: { revision: 1, sheets: [] },
    profiles: {},
    layouts: {
      sheet: {
        revision: 1,
        rowCount: 100,
        columnCount: 20,
        defaultRowHeight: 20,
        defaultColumnWidth: 64,
        rows: [],
        columns: [],
      },
    },
  });
  await source.ensureSheet('sheet');
  await source.ensureSheet('sheet');
  assert.deepEqual(
    source.getMergeRanges('sheet', {
      startRow: 2,
      endRow: 2,
      startColumn: 2,
      endColumn: 2,
    }),
    [merge],
  );
  assert.equal(
    calls.filter((operation) => operation === 'get-sheet-merges').length,
    1,
  );
  assert.equal(
    calls.includes('get-range') || calls.includes('get-materialized-sheet'),
    false,
  );
  await source.dispose();
});
