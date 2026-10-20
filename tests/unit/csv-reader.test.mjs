import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
const result = await build({
  stdin: {
    contents:
      "export {scanCsv} from './packages/csv/src/parser/scanCsv';export {readCsvRow,csvCellText} from './packages/csv/src/parser/csvCells';",
    resolveDir: process.cwd(),
  },
  alias: { '@fivo/core/text': resolve('packages/core/src/text.ts') },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { scanCsv, readCsvRow, csvCellText } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')
);
test('CSV 引号换行、转义和末尾空格保留实际字段', async () => {
  const text = 'a,b\r\n"1\n2","x""y"\r\n',
    signal = new AbortController().signal;
  const result = await scanCsv(
    text,
    { delimiter: 'auto', maxRows: 100, maxColumns: 10 },
    signal,
  );
  assert.equal(result.kind, 'ready');
  assert.equal(result.index.rowStarts.length, 2);
  const cells = await readCsvRow(text, result.index, 1, signal);
  assert.equal(await csvCellText(text, cells[0], { signal }), '1\n2');
  assert.equal(await csvCellText(text, cells[1], { signal }), 'x"y');
  assert.equal(
    (
      await scanCsv(
        'a,b,c',
        { delimiter: ',', maxColumns: 2, maxRows: 10 },
        signal,
      )
    ).kind,
    'limited',
  );
});
test('CSV 引号跨 64 Ki 字符边界且字段截断只影响预览', async () => {
  const text = '"' + '中'.repeat(65535) + '""尾",\n',
    signal = new AbortController().signal;
  const result = await scanCsv(
    text,
    { delimiter: ',', maxRows: 10, maxColumns: 10 },
    signal,
  );
  const cells = await readCsvRow(text, result.index, 0, signal);
  assert.equal((await csvCellText(text, cells[0], { signal })).length, 65537);
  assert.equal(
    await csvCellText(text, cells[0], { maxChars: 3, signal }),
    '中中中',
  );
});
