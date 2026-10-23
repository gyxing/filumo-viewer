import type { GridPoint, GridRange, GridRect } from '@filumo/dom/grid';
import type { SpreadsheetAxisIndex } from '../../engine/spreadsheet/SpreadsheetAxisIndex';
import type { SpreadsheetSheetLayout } from '../../engine/spreadsheet/SpreadsheetSource';
import { resolveSpreadsheetFrozenCounts } from './SpreadsheetGridModel';
import {
  XLSX_COLUMN_HEADER_HEIGHT as HEADER,
  XLSX_ROW_HEADER_WIDTH as ROW_HEADER,
} from './sheetStyles';

export interface SpreadsheetGridGeometry {
  host: HTMLElement;
  layout: SpreadsheetSheetLayout;
  rows: SpreadsheetAxisIndex;
  columns: SpreadsheetAxisIndex;
  scale: number;
}

/** 与现有画布的外边距、缩放及四象限冻结规则保持同一几何空间。 */
export function spreadsheetGridMetrics(grid: SpreadsheetGridGeometry) {
  const style = grid.host.ownerDocument.defaultView?.getComputedStyle(
    grid.host,
  );
  const x = parseFloat(style?.paddingLeft ?? '0') || 0,
    y = parseFloat(style?.paddingTop ?? '0') || 0;
  const height = Math.max(
    1,
    grid.host.clientHeight - y - (parseFloat(style?.paddingBottom ?? '0') || 0),
  );
  const width = Math.max(
    1,
    grid.host.clientWidth - x - (parseFloat(style?.paddingRight ?? '0') || 0),
  );
  const { frozenRows, frozenColumns } = resolveSpreadsheetFrozenCounts(
    grid.layout,
    { rows: grid.rows, columns: grid.columns },
    { width: width / grid.scale, height: height / grid.scale },
  );
  const left = Math.max(0, x - grid.host.scrollLeft) + ROW_HEADER * grid.scale;
  const top = Math.max(0, y - grid.host.scrollTop) + HEADER * grid.scale;
  // 固定内容与表头使用同一画布位移，滚动经过内边距后不能再保留这段空隙。
  const pinX = Math.max(0, grid.host.scrollLeft - x) / grid.scale;
  const pinY = Math.max(0, grid.host.scrollTop - y) / grid.scale;
  return {
    x,
    y,
    pinX,
    pinY,
    frozenRows,
    frozenColumns,
    left,
    top,
    frozenRight: left + grid.columns.rangeSize(1, frozenColumns) * grid.scale,
    frozenBottom: top + grid.rows.rangeSize(1, frozenRows) * grid.scale,
  };
}

/** 同一帧的绘制共享测量结果，避免写入单元格后再次读取布局。 */
export type SpreadsheetGridMetrics = ReturnType<typeof spreadsheetGridMetrics>;

/** 正文与三个冻结分区共用裁剪边界，合并内容不能漏入表头、行号栏及滚动条留白。 */
export function spreadsheetGridPaneClips(
  grid: SpreadsheetGridGeometry,
  canvasWidth: number,
  canvasHeight: number,
  m = spreadsheetGridMetrics(grid),
): Record<'body' | 'rows' | 'columns' | 'corner', string> {
  const right = Math.min(
    canvasWidth,
    (grid.host.scrollLeft + grid.host.clientWidth - m.x) / grid.scale,
  );
  const bottom = Math.min(
    canvasHeight,
    (grid.host.scrollTop + grid.host.clientHeight - m.y) / grid.scale,
  );
  const left = Math.min(right, m.pinX + ROW_HEADER);
  const top = Math.min(bottom, m.pinY + HEADER);
  const frozenRight = Math.min(
    right,
    left + grid.columns.rangeSize(1, m.frozenColumns),
  );
  const frozenBottom = Math.min(
    bottom,
    top + grid.rows.rangeSize(1, m.frozenRows),
  );
  const clip = (x: number, y: number, r: number, b: number) =>
    `inset(${y}px ${Math.max(0, canvasWidth - r)}px ${Math.max(
      0,
      canvasHeight - b,
    )}px ${x}px)`;
  return {
    body: clip(frozenRight, frozenBottom, right, bottom),
    rows: clip(frozenRight, top, right, frozenBottom),
    columns: clip(left, frozenBottom, frozenRight, bottom),
    corner: clip(left, top, frozenRight, frozenBottom),
  };
}

/** 逻辑范围按冻结象限裁剪，返回相对视口的矩形，不创建全表 DOM。 */
export function spreadsheetSelectionRects(
  grid: SpreadsheetGridGeometry,
  range: GridRange,
): GridRect[] {
  const m = spreadsheetGridMetrics(grid),
    result: GridRect[] = [];
  for (const frozenRow of [false, true])
    for (const frozenColumn of [false, true]) {
      if ((frozenRow && !m.frozenRows) || (frozenColumn && !m.frozenColumns))
        continue;
      const row = Math.max(range.startRow, frozenRow ? 0 : m.frozenRows),
        endRow = Math.min(
          range.endRow,
          frozenRow ? m.frozenRows - 1 : grid.layout.rowCount - 1,
        );
      const column = Math.max(
          range.startColumn,
          frozenColumn ? 0 : m.frozenColumns,
        ),
        endColumn = Math.min(
          range.endColumn,
          frozenColumn ? m.frozenColumns - 1 : grid.layout.columnCount - 1,
        );
      if (row > endRow || column > endColumn) continue;
      const left = frozenColumn
        ? m.left + grid.columns.offsetAt(column + 1) * grid.scale
        : m.x +
          (ROW_HEADER + grid.columns.offsetAt(column + 1)) * grid.scale -
          grid.host.scrollLeft;
      const top = frozenRow
        ? m.top + grid.rows.offsetAt(row + 1) * grid.scale
        : m.y +
          (HEADER + grid.rows.offsetAt(row + 1)) * grid.scale -
          grid.host.scrollTop;
      const right =
        left + grid.columns.rangeSize(column + 1, endColumn + 1) * grid.scale;
      const bottom =
        top + grid.rows.rangeSize(row + 1, endRow + 1) * grid.scale;
      const x = Math.max(left, frozenColumn ? m.left : m.frozenRight),
        y = Math.max(top, frozenRow ? m.top : m.frozenBottom);
      const r = Math.min(
          right,
          frozenColumn ? m.frozenRight : grid.host.clientWidth,
        ),
        b = Math.min(
          bottom,
          frozenRow ? m.frozenBottom : grid.host.clientHeight,
        );
      if (r > x && b > y)
        result.push({ left: x, top: y, width: r - x, height: b - y });
    }
  return result;
}

/** 隐藏行列由轴索引跳过；命中与拖选均不依赖已经渲染的单元格。 */
export function spreadsheetHitTest(
  grid: SpreadsheetGridGeometry,
  clientX: number,
  clientY: number,
  clamp: boolean,
): GridPoint | undefined {
  const rect = grid.host.getBoundingClientRect(),
    m = spreadsheetGridMetrics(grid);
  // clientLeft 包含 stable both-edges 的左侧滚动条占位，需与选区覆盖层原点一致。
  let x = clientX - rect.left - (grid.host.clientLeft || 0),
    y = clientY - rect.top - (grid.host.clientTop || 0);
  if (
    !clamp &&
    (x < m.left ||
      y < m.top ||
      x >= grid.host.clientWidth ||
      y >= grid.host.clientHeight)
  )
    return undefined;
  x = Math.max(m.left, Math.min(grid.host.clientWidth - 1, x));
  y = Math.max(m.top, Math.min(grid.host.clientHeight - 1, y));
  const columnOffset =
    x < m.frozenRight
      ? (x - m.left) / grid.scale
      : (x - m.x - ROW_HEADER * grid.scale + grid.host.scrollLeft) / grid.scale;
  const rowOffset =
    y < m.frozenBottom
      ? (y - m.top) / grid.scale
      : (y - m.y - HEADER * grid.scale + grid.host.scrollTop) / grid.scale;
  const row = grid.rows.findIndexAtOffset(Math.max(0, rowOffset)),
    column = grid.columns.findIndexAtOffset(Math.max(0, columnOffset));
  if (
    row > grid.layout.rowCount ||
    column > grid.layout.columnCount ||
    grid.rows.sizeAt(row) <= 0 ||
    grid.columns.sizeAt(column) <= 0
  )
    return undefined;
  if (
    !clamp &&
    (rowOffset >= grid.rows.offsetAt(grid.layout.rowCount + 1) ||
      columnOffset >= grid.columns.offsetAt(grid.layout.columnCount + 1))
  )
    return undefined;
  return {
    row: Math.min(grid.layout.rowCount, row) - 1,
    column: Math.min(grid.layout.columnCount, column) - 1,
  };
}

/** 只滚动不可见的轴，冻结单元格和已可见目标不会反复居中。 */
export function revealSpreadsheetCell(
  grid: SpreadsheetGridGeometry,
  point: GridPoint,
): void {
  const m = spreadsheetGridMetrics(grid),
    row = point.row + 1,
    column = point.column + 1;
  const reveal = (
    frozen: boolean,
    position: number,
    size: number,
    min: number,
    max: number,
    current: number,
  ) =>
    frozen
      ? current
      : position < min || size > max - min
      ? current + position - min
      : position + size > max
      ? current + position + size - max
      : current;
  const left =
    m.x +
    (ROW_HEADER + grid.columns.offsetAt(column)) * grid.scale -
    (column <= m.frozenColumns ? 0 : grid.host.scrollLeft);
  const top =
    m.y +
    (HEADER + grid.rows.offsetAt(row)) * grid.scale -
    (row <= m.frozenRows ? 0 : grid.host.scrollTop);
  grid.host.scrollLeft = Math.max(
    0,
    reveal(
      column <= m.frozenColumns,
      left,
      grid.columns.sizeAt(column) * grid.scale,
      m.frozenRight,
      grid.host.clientWidth,
      grid.host.scrollLeft,
    ),
  );
  grid.host.scrollTop = Math.max(
    0,
    reveal(
      row <= m.frozenRows,
      top,
      grid.rows.sizeAt(row) * grid.scale,
      m.frozenBottom,
      grid.host.clientHeight,
      grid.host.scrollTop,
    ),
  );
}
