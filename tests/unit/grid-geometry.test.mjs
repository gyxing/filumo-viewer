import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';

const result = await build({
  stdin: {
    contents:
      "export * from './packages/office/src/renderers/spreadsheet/SpreadsheetGridGeometry'; export * from './packages/office/src/renderers/spreadsheet/SpreadsheetGridModel'; export * from './packages/office/src/engine/spreadsheet/SpreadsheetAxisIndex'; export * from './packages/office/src/engine/spreadsheet/SpreadsheetMergeIndex'; export * from './packages/dom/src/grid/columnResize';",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const {
  spreadsheetSelectionRects,
  spreadsheetHitTest,
  spreadsheetGridPaneClips,
  spreadsheetGridMetrics,
  resolveSpreadsheetFrozenCounts,
  createSpreadsheetAxisIndex,
  SpreadsheetMergeIndex,
  GridColumnResize,
} = await import(
  'data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')
);

test('冻结区和正文选择分区裁剪，冻结单元格不随正文滚动', () => {
  const host = {
    clientWidth: 600,
    clientHeight: 400,
    scrollLeft: 80,
    scrollTop: 20,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    ownerDocument: {
      defaultView: {
        getComputedStyle: () => ({
          paddingLeft: '16px',
          paddingTop: '16px',
          paddingRight: '16px',
          paddingBottom: '16px',
        }),
      },
    },
  };
  const grid = {
    host,
    scale: 1,
    rows: createSpreadsheetAxisIndex(1000, 20, []),
    columns: createSpreadsheetAxisIndex(100, 80, []),
    layout: {
      rowCount: 1000,
      columnCount: 100,
      pane: { state: 'frozen', frozenRows: 1, frozenColumns: 1 },
    },
  };
  const rects = spreadsheetSelectionRects(grid, {
    startRow: 0,
    endRow: 4,
    startColumn: 0,
    endColumn: 4,
  });
  assert.equal(rects.length, 4);
  assert.ok(
    rects.every(
      (rect) =>
        rect.left >= 0 &&
        rect.top >= 0 &&
        rect.left + rect.width <= 600 &&
        rect.top + rect.height <= 400,
    ),
  );
  const before = spreadsheetSelectionRects(grid, {
    startRow: 0,
    endRow: 0,
    startColumn: 0,
    endColumn: 0,
  });
  host.scrollLeft = 200;
  host.scrollTop = 200;
  assert.deepEqual(
    spreadsheetSelectionRects(grid, {
      startRow: 0,
      endRow: 0,
      startColumn: 0,
      endColumn: 0,
    }),
    before,
  );
  assert.deepEqual(
    spreadsheetHitTest(grid, before[0].left + 1, before[0].top + 1, false),
    { row: 0, column: 0 },
  );
});

test('合并元数据规范化不枚举单元格，支持跨区域连续扩选', () => {
  const merges = new SpreadsheetMergeIndex([
    { startRow: 1, endRow: 2, startColumn: 1, endColumn: 2 },
    { startRow: 2, endRow: 3, startColumn: 3, endColumn: 4 },
  ]);
  assert.deepEqual(
    merges.expand({ startRow: 1, endRow: 2, startColumn: 2, endColumn: 3 }),
    { startRow: 1, endRow: 3, startColumn: 1, endColumn: 4 },
  );
  assert.deepEqual(
    merges.query({ startRow: 999, endRow: 1000, startColumn: 1, endColumn: 4 }),
    [],
  );
});

test('冻结区必须给正文保留一个默认单元格的空间，列宽恢复后自动恢复冻结', () => {
  const layout = {
    rowCount: 200,
    columnCount: 31,
    defaultRowHeight: 20,
    defaultColumnWidth: 64,
    pane: { state: 'frozen', frozenRows: 2, frozenColumns: 3 },
  };
  const rows = createSpreadsheetAxisIndex(200, 20, []);
  const columns = (width) =>
    createSpreadsheetAxisIndex(31, 64, [
      { index: 1, width },
      { index: 2, width: 35 },
      { index: 3, width: 67 },
    ]);
  const viewport = { width: 648, height: 489 };
  assert.deepEqual(
    resolveSpreadsheetFrozenCounts(
      layout,
      { rows, columns: columns(40) },
      viewport,
    ),
    { frozenRows: 2, frozenColumns: 3 },
  );
  assert.deepEqual(
    resolveSpreadsheetFrozenCounts(
      layout,
      { rows, columns: columns(520) },
      viewport,
    ),
    { frozenRows: 2, frozenColumns: 0 },
  );
  assert.deepEqual(
    resolveSpreadsheetFrozenCounts(
      layout,
      { rows, columns: columns(40) },
      viewport,
    ),
    { frozenRows: 2, frozenColumns: 3 },
  );
  assert.deepEqual(
    resolveSpreadsheetFrozenCounts(
      layout,
      { rows, columns: columns(520) },
      { width: 1100, height: 489 },
    ),
    { frozenRows: 2, frozenColumns: 3 },
  );
  assert.deepEqual(
    resolveSpreadsheetFrozenCounts(
      layout,
      {
        rows: createSpreadsheetAxisIndex(200, 20, [{ index: 1, height: 600 }]),
        columns: columns(40),
      },
      viewport,
    ),
    { frozenRows: 0, frozenColumns: 3 },
  );
});

test('冻结内容按缩放后的视口分区裁剪，合并单元格不能越过冻结边界', () => {
  const grid = {
    host: {
      clientWidth: 600,
      clientHeight: 400,
      scrollLeft: 200,
      scrollTop: 80,
      ownerDocument: {
        defaultView: {
          getComputedStyle: () => ({
            paddingLeft: '16px',
            paddingRight: '16px',
            paddingTop: '16px',
            paddingBottom: '16px',
          }),
        },
      },
    },
    scale: 2,
    rows: createSpreadsheetAxisIndex(100, 20, []),
    columns: createSpreadsheetAxisIndex(100, 80, []),
    layout: {
      rowCount: 100,
      columnCount: 100,
      pane: { state: 'frozen', frozenRows: 1, frozenColumns: 1 },
    },
  };
  assert.deepEqual(spreadsheetGridPaneClips(grid, 1000, 2000), {
    body: 'inset(80px 608px 1768px 220px)',
    rows: 'inset(60px 608px 1920px 220px)',
    columns: 'inset(80px 780px 1768px 140px)',
    corner: 'inset(60px 780px 1920px 140px)',
  });
});

test('滚动抵消内边距后冻结边界贴合表头，命中坐标包含原生滚动条占位', () => {
  const grid = {
    host: {
      clientWidth: 600,
      clientHeight: 400,
      clientLeft: 15,
      clientTop: 2,
      scrollLeft: 80,
      scrollTop: 60,
      getBoundingClientRect: () => ({ left: 100, top: 200 }),
      ownerDocument: {
        defaultView: {
          getComputedStyle: () => ({
            paddingLeft: '16px',
            paddingRight: '16px',
            paddingTop: '16px',
            paddingBottom: '16px',
          }),
        },
      },
    },
    scale: 1,
    rows: createSpreadsheetAxisIndex(100, 20, []),
    columns: createSpreadsheetAxisIndex(100, 80, []),
    layout: {
      rowCount: 100,
      columnCount: 100,
      pane: { state: 'frozen', frozenRows: 1, frozenColumns: 1 },
    },
  };
  const m = spreadsheetGridMetrics(grid);
  assert.deepEqual(
    [m.left, m.top, m.frozenRight, m.frozenBottom],
    [48, 28, 128, 48],
  );
  assert.deepEqual(spreadsheetHitTest(grid, 173, 240, false), {
    row: 0,
    column: 0,
  });
  assert.deepEqual(spreadsheetHitTest(grid, 265, 262, false), {
    row: 3,
    column: 2,
  });
  assert.equal(spreadsheetHitTest(grid, 715, 262, false), undefined);
  assert.deepEqual(
    spreadsheetSelectionRects(grid, {
      startRow: 3,
      endRow: 3,
      startColumn: 2,
      endColumn: 2,
    }),
    [{ left: 144, top: 48, width: 80, height: 16 }],
  );
});

test('列宽按未缩放像素计算，取消还原覆盖，提交后保留', () => {
  const handlers = new Map(),
    values = new Map();
  let frame;
  const handle = { dataset: { resizeColumn: '0' }, closest: () => handle };
  const host = {
    tabIndex: 0,
    contains: () => true,
    focus() {},
    setPointerCapture() {},
    hasPointerCapture: () => false,
    ownerDocument: {
      defaultView: {
        requestAnimationFrame: (callback) => {
          frame = callback;
          return 1;
        },
        cancelAnimationFrame() {},
      },
    },
    addEventListener: (name, callback) => handlers.set(name, callback),
    removeEventListener() {},
  };
  const resize = new GridColumnResize({
    host,
    scale: () => 2,
    width: () => values.get(0) ?? 100,
    override: (column) => values.get(column),
    change: (column, width) =>
      width === undefined ? values.delete(column) : values.set(column, width),
  });
  const event = {
    target: handle,
    button: 0,
    isPrimary: true,
    pointerId: 1,
    clientX: 100,
    preventDefault() {},
    stopPropagation() {},
  };
  handlers.get('pointerdown')(event);
  handlers.get('pointermove')({ ...event, clientX: 140 });
  frame();
  assert.equal(values.get(0), 120);
  handlers.get('pointercancel')();
  assert.equal(values.has(0), false);
  handlers.get('pointerdown')(event);
  handlers.get('pointermove')({ ...event, clientX: 160 });
  handlers.get('pointerup')(event);
  assert.equal(values.get(0), 130);
  resize.dispose();
  assert.equal(values.get(0), 130);
});

test('列宽拖动先通知开始，结束通知在最终值提交或取消恢复后各执行一次', () => {
  const handlers = new Map(),
    values = new Map(),
    stages = [];
  let frame;
  const handle = { dataset: { resizeColumn: '0' }, closest: () => handle };
  const host = {
    tabIndex: 0,
    contains: () => true,
    focus() {},
    setPointerCapture() {},
    hasPointerCapture: () => false,
    ownerDocument: {
      defaultView: {
        requestAnimationFrame(callback) {
          frame = callback;
          return 1;
        },
        cancelAnimationFrame() {
          frame = undefined;
        },
      },
    },
    addEventListener: (name, callback) => handlers.set(name, callback),
    removeEventListener() {},
  };
  const resize = new GridColumnResize({
    host,
    scale: () => 1,
    width: () => values.get(0) ?? 100,
    override: (column) => values.get(column),
    change(column, width) {
      if (width === undefined) values.delete(column);
      else values.set(column, width);
      stages.push(['change', width]);
    },
    start: () => stages.push(['start', values.get(0)]),
    end: (committed) => stages.push(['end', committed, values.get(0)]),
  });
  const event = {
    target: handle,
    button: 0,
    isPrimary: true,
    pointerId: 1,
    clientX: 100,
    preventDefault() {},
    stopPropagation() {},
  };
  handlers.get('pointerdown')(event);
  handlers.get('pointermove')({ ...event, clientX: 120 });
  handlers.get('pointermove')({ ...event, clientX: 140 });
  frame();
  handlers.get('pointerup')(event);
  handlers.get('lostpointercapture')();
  assert.deepEqual(stages, [
    ['start', undefined],
    ['change', 140],
    ['end', true, 140],
  ]);
  stages.length = 0;
  handlers.get('pointerdown')(event);
  handlers.get('pointermove')({ ...event, clientX: 120 });
  frame();
  resize.setActive(false);
  resize.dispose();
  assert.deepEqual(stages, [
    ['start', 140],
    ['change', 160],
    ['change', 140],
    ['end', false, 140],
  ]);
});
