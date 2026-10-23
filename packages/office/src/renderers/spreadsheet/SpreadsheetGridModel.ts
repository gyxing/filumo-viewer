import type { SpreadsheetSheetLayout } from '../../engine/spreadsheet/SpreadsheetSource';
import type { SpreadsheetAxisIndex } from '../../engine/spreadsheet/SpreadsheetAxisIndex';
import {
  XLSX_COLUMN_HEADER_HEIGHT,
  XLSX_ROW_HEADER_WIDTH,
} from './sheetStyles';

let sequence = 0;

/** 空间不足时暂停该方向冻结，至少给正文保留一个默认单元格；恢复空间后沿用源冻结信息。 */
export function resolveSpreadsheetFrozenCounts(
  layout: SpreadsheetSheetLayout,
  axes: { rows: SpreadsheetAxisIndex; columns: SpreadsheetAxisIndex },
  viewport: { width: number; height: number },
) {
  const pane = layout.pane;
  if (!pane || pane.state === 'split')
    return { frozenRows: 0, frozenColumns: 0 };
  const rows = Math.max(0, Math.min(pane.frozenRows, layout.rowCount));
  const columns = Math.max(0, Math.min(pane.frozenColumns, layout.columnCount));
  const rowBudget = Math.max(
    0,
    viewport.height -
      XLSX_COLUMN_HEADER_HEIGHT -
      (layout.defaultRowHeight || 20),
  );
  const columnBudget = Math.max(
    0,
    viewport.width - XLSX_ROW_HEADER_WIDTH - (layout.defaultColumnWidth || 64),
  );
  return {
    frozenRows: axes.rows.rangeSize(1, rows) <= rowBudget ? rows : 0,
    frozenColumns:
      axes.columns.rangeSize(1, columns) <= columnBudget ? columns : 0,
  };
}

/** 统一网格实例缩放和调度键，避免 DOM 编排代码重复维护标识规则。 */
export function normalizeSpreadsheetGridScale(zoom: number) {
  return Math.max(0.01, zoom / 100);
}

export function createSpreadsheetGridKey(sheetId: string) {
  return 'sheet-' + sheetId + '-' + ++sequence;
}
