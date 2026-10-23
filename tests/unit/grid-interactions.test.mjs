import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';

const bundle = await build({
  stdin: {
    contents:
      "export * from './packages/dom/src/grid/selection'; export * from './packages/dom/src/grid/clipboard'; export * from './packages/dom/src/grid/keyboard'; export * from './packages/dom/src/grid/textSelection';",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const {
  GridSelection,
  serializeGridSelection,
  gridKeyboardTarget,
  gridTextCellAtPoint,
} = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
const bounds = { startRow: 1, endRow: 1000, startColumn: 0, endColumn: 20 };

test('文字选择依据真实文字行框，点击空白不误判为选字', () => {
  const cell = {};
  const text = { textContent: '中文 text' };
  const host = {
    contains: (node) => node === cell,
    ownerDocument: {
      createTreeWalker() {
        let visited = false;
        return { nextNode: () => (visited ? null : ((visited = true), text)) };
      },
      createRange: () => ({
        selectNodeContents() {},
        getClientRects: () => [{ left: 10, top: 20, right: 80, bottom: 38 }],
      }),
    },
  };
  const target = { closest: () => cell };
  assert.equal(
    gridTextCellAtPoint(host, { target, clientX: 30, clientY: 25 }),
    cell,
  );
  assert.equal(
    gridTextCellAtPoint(host, { target, clientX: 100, clientY: 25 }),
    undefined,
  );
  assert.equal(
    gridTextCellAtPoint(host, { target, clientX: 30, clientY: 50 }),
    undefined,
  );
});

test('共享选区保留反向锚点并夹紧表头后的正文边界', () => {
  const selection = new GridSelection();
  selection.select({ row: 1000, column: 20 }, false, bounds);
  selection.select({ row: 900, column: 10 }, true, bounds);
  assert.equal(selection.contains(950, 15), true);
  assert.deepEqual(selection.anchor, { row: 1000, column: 20 });
  selection.select({ row: 0, column: 0 }, false, bounds);
  assert.equal(selection.focus.row, 1);
  selection.clamp(undefined);
  assert.equal(selection.range, undefined);
});

test('Tab 在正文边界离开网格，Home/End 不遍历整张表', () => {
  assert.equal(
    gridKeyboardTarget(
      { row: 1000, column: 20 },
      'Tab',
      false,
      false,
      bounds,
      10,
    ),
    undefined,
  );
  assert.deepEqual(
    gridKeyboardTarget({ row: 5, column: 20 }, 'Tab', false, false, bounds, 10),
    { row: 6, column: 0 },
  );
  assert.deepEqual(
    gridKeyboardTarget({ row: 5, column: 3 }, 'Home', false, true, bounds, 10),
    { row: 1, column: 0 },
  );
});

test('全选保持活动位置，保存的范围包含隐藏尾列，不枚举单元格', () => {
  const selection = new GridSelection();
  selection.select({ row: 2, column: 3 }, false, bounds);
  selection.selectAll(bounds);
  assert.deepEqual(selection.focus, { row: 2, column: 3 });
  assert.deepEqual(selection.range, bounds);
  const restored = new GridSelection(selection.getState());
  assert.deepEqual(restored.range, bounds);
  restored.select({ row: 3, column: 3 }, false, bounds);
  assert.equal(restored.range.endRow, 3);
});

test('共享复制保留完整字段，矩形 TSV 正确保护引号和换行', async () => {
  const range = { startRow: 0, endRow: 0, startColumn: 0, endColumn: 2 };
  const signal = new AbortController().signal;
  const rows = async function* () {
    yield ['00123', 'a\tb', 'x"\ny'];
  };
  assert.equal(
    await serializeGridSelection(range, rows(), signal),
    '00123\t"a\tb"\t"x""\ny"',
  );
  assert.equal(
    await serializeGridSelection(
      { ...range, endColumn: 0 },
      (async function* () {
        yield ['a\tb'];
      })(),
      signal,
    ),
    'a\tb',
  );
});

test('超预算或取消复制不交付部分结果', async () => {
  const own = new AbortController();
  const rows = async function* () {
    yield ['too large'];
  };
  await assert.rejects(
    serializeGridSelection(
      { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 },
      rows(),
      own.signal,
      { maxBytes: 4 },
    ),
    /选区|复制/,
  );
  own.abort();
  await assert.rejects(
    serializeGridSelection(
      { startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 },
      rows(),
      own.signal,
    ),
  );
});

test('超出单元格预算时不启动数据读取，中途取消会关闭迭代器', async () => {
  let read = false,
    released = false;
  const own = new AbortController();
  const rows = async function* () {
    read = true;
    yield ['x'];
  };
  await assert.rejects(
    serializeGridSelection(
      { startRow: 0, endRow: 100000, startColumn: 0, endColumn: 0 },
      rows(),
      own.signal,
    ),
    /选区/,
  );
  assert.equal(read, false);
  const cancelled = async function* () {
    try {
      yield ['first'];
      own.abort();
      yield ['second'];
    } finally {
      released = true;
    }
  };
  await assert.rejects(
    serializeGridSelection(
      { startRow: 0, endRow: 1, startColumn: 0, endColumn: 0 },
      cancelled(),
      own.signal,
    ),
  );
  assert.equal(released, true);
});
