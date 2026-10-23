import {
  GridColumnResize,
  GridInteractionController,
  createGridNotice,
  gridKeyboardTarget,
} from '@filumo/dom/grid';
import type { GridPoint, GridRange, GridState } from '@filumo/dom/grid';
import type { SpreadsheetRange } from '../../engine/spreadsheet/types';
import type { SpreadsheetSource } from '../../engine/spreadsheet/SpreadsheetSource';
import type { OfficeRenderContext } from '../../view/types';
import {
  revealSpreadsheetCell,
  spreadsheetHitTest,
  spreadsheetSelectionRects,
  type SpreadsheetGridGeometry,
} from './SpreadsheetGridGeometry';

export interface SpreadsheetGridState extends GridState {
  widths: [number, number][];
  scroll?: {
    row: number;
    column: number;
    rowOffset: number;
    columnOffset: number;
  };
}
export interface SpreadsheetInteractionOptions {
  source: SpreadsheetSource;
  sheetId: string;
  context: OfficeRenderContext;
  geometry(): SpreadsheetGridGeometry;
  schedule(): void;
  width(column: number): number | undefined;
  changeWidth(column: number, width: number | undefined): void;
  widths(): [number, number][];
  clearWidths(): void;
  resizeStart(): void;
  resizeEnd(): void;
}

const sourceRange = (range: GridRange): SpreadsheetRange => ({
  startRow: range.startRow + 1,
  endRow: range.endRow + 1,
  startColumn: range.startColumn + 1,
  endColumn: range.endColumn + 1,
});

/** Excel 仅在此转换坐标和读取语义，公共交互不会接触工作簿类型。 */
export class SpreadsheetGridInteraction {
  readonly controller: GridInteractionController;
  private resizing: GridColumnResize;
  private notice: ReturnType<typeof createGridNotice>;
  private noticeId = 0;
  private active = true;
  private closed = false;
  private publishedWidths?: boolean;
  constructor(
    private options: SpreadsheetInteractionOptions,
    state?: GridState,
  ) {
    const host = options.geometry().host;
    this.notice = createGridNotice(host.ownerDocument, () =>
      host.focus({ preventScroll: true }),
    );
    this.resizing = new GridColumnResize({
      host,
      scale: () => options.geometry().scale,
      width: (column) => options.geometry().columns.sizeAt(column + 1),
      override: (column) => options.width(column + 1),
      start: () => options.resizeStart(),
      end: () => options.resizeEnd(),
      change: (column, value) => {
        options.changeWidth(column + 1, value);
        this.publishWidths();
      },
    });
    this.controller = new GridInteractionController({
      stylePolicy: options.context.stylePolicy,
      host,
      state,
      onTextSelectionChange: () => options.schedule(),
      onError: this.error,
      locale: options.context.locale,
      search: () => {
        void options.context.services.state
          .execute({ type: 'search', open: true })
          .catch(this.error);
      },
      adapter: {
        bounds: () => this.bounds(),
        revision: () => options.source.getSheetLayout(options.sheetId).revision,
        hitTest: (x, y, clamp) =>
          spreadsheetHitTest(options.geometry(), x, y, clamp),
        rects: (range) => spreadsheetSelectionRects(options.geometry(), range),
        normalize: (range) => this.normalize(range),
        point: (point) => this.point(point),
        move: (point, key, shift, control) =>
          this.move(point, key, shift, control),
        reveal: (point) => {
          revealSpreadsheetCell(options.geometry(), point);
          options.schedule();
        },
        readRows: (range, signal) => this.readRows(range, signal),
      },
    });
  }
  private bounds(): GridRange | undefined {
    const layout = this.options.geometry().layout;
    return layout.rowCount > 0 && layout.columnCount > 0
      ? {
          startRow: 0,
          endRow: layout.rowCount - 1,
          startColumn: 0,
          endColumn: layout.columnCount - 1,
        }
      : undefined;
  }
  private merges(range: GridRange) {
    return (
      this.options.source.getMergeRanges?.(
        this.options.sheetId,
        sourceRange(range),
      ) ?? []
    );
  }
  private normalize(range: GridRange): GridRange {
    let result = { ...range },
      changed = true;
    while (changed) {
      changed = false;
      for (const merge of this.merges(result)) {
        const next = {
          startRow: Math.min(result.startRow, merge.startRow - 1),
          endRow: Math.max(result.endRow, merge.endRow - 1),
          startColumn: Math.min(result.startColumn, merge.startColumn - 1),
          endColumn: Math.max(result.endColumn, merge.endColumn - 1),
        };
        if (
          next.startRow !== result.startRow ||
          next.endRow !== result.endRow ||
          next.startColumn !== result.startColumn ||
          next.endColumn !== result.endColumn
        ) {
          result = next;
          changed = true;
        }
      }
    }
    return result;
  }
  private point(point: GridPoint): GridPoint | undefined {
    const g = this.options.geometry();
    const visible = (index: number, max: number, axis: typeof g.rows) => {
      let at = index + 1;
      if (axis.sizeAt(at) <= 0)
        at = axis.findIndexAtOffset(axis.offsetAt(at) + 0.001);
      return at <= max && axis.sizeAt(at) > 0 ? at - 1 : undefined;
    };
    const row = visible(point.row, g.layout.rowCount, g.rows),
      column = visible(point.column, g.layout.columnCount, g.columns);
    if (row === undefined || column === undefined) return undefined;
    const normalized = this.normalize({
      startRow: row,
      endRow: row,
      startColumn: column,
      endColumn: column,
    });
    return { row: normalized.startRow, column: normalized.startColumn };
  }
  private move(
    point: GridPoint,
    key: string,
    shift: boolean,
    control: boolean,
  ): GridPoint | undefined {
    const bounds = this.bounds();
    if (!bounds) return undefined;
    const g = this.options.geometry();
    let next = gridKeyboardTarget(
      point,
      key,
      shift,
      control,
      bounds,
      Math.max(
        1,
        g.rows.findIndexAtOffset(
          g.host.scrollTop / g.scale + g.host.clientHeight / g.scale,
        ) - g.rows.findIndexAtOffset(g.host.scrollTop / g.scale),
      ),
    );
    if (!next) return undefined;
    const merge = this.normalize({
      startRow: point.row,
      endRow: point.row,
      startColumn: point.column,
      endColumn: point.column,
    });
    if (key === 'Tab') {
      next = {
        row: point.row,
        column: shift ? merge.startColumn - 1 : merge.endColumn + 1,
      };
      if (next.column > bounds.endColumn)
        next = { row: merge.endRow + 1, column: bounds.startColumn };
      if (next.column < bounds.startColumn)
        next = { row: merge.startRow - 1, column: bounds.endColumn };
      if (next.row < bounds.startRow || next.row > bounds.endRow)
        return undefined;
    }
    if (key === 'ArrowRight')
      next.column = Math.max(next.column, merge.endColumn + 1);
    if (key === 'ArrowDown') next.row = Math.max(next.row, merge.endRow + 1);
    const backwards =
      key === 'ArrowLeft' ||
      key === 'ArrowUp' ||
      key === 'End' ||
      key === 'PageUp' ||
      (key === 'Tab' && shift);
    const skip = (
      index: number,
      min: number,
      max: number,
      axis: typeof g.rows,
    ) => {
      let at = Math.max(min, Math.min(max, index)) + 1;
      if (axis.sizeAt(at) <= 0)
        at = axis.findIndexAtOffset(
          Math.max(0, axis.offsetAt(at) + (backwards ? -0.001 : 0.001)),
        );
      return Math.max(min, Math.min(max, at - 1));
    };
    next = {
      row: skip(next.row, bounds.startRow, bounds.endRow, g.rows),
      column: skip(
        next.column,
        bounds.startColumn,
        bounds.endColumn,
        g.columns,
      ),
    };
    if (
      key === 'Tab' &&
      next.row === point.row &&
      (g.columns.sizeAt(next.column + 1) <= 0 ||
        (shift ? next.column >= point.column : next.column <= point.column))
    ) {
      const row = shift ? merge.startRow - 1 : merge.endRow + 1;
      if (row < bounds.startRow || row > bounds.endRow) return undefined;
      next = {
        row: skip(row, bounds.startRow, bounds.endRow, g.rows),
        column: skip(
          shift ? bounds.endColumn : bounds.startColumn,
          bounds.startColumn,
          bounds.endColumn,
          g.columns,
        ),
      };
      if (shift ? next.row >= point.row : next.row <= point.row)
        return undefined;
    }
    return this.point(next) ?? (key === 'Tab' ? undefined : point);
  }
  private async *readRows(range: GridRange, signal: AbortSignal) {
    const source = this.options.source,
      id = this.options.sheetId;
    for (let row = range.startRow; row <= range.endRow; ) {
      let endRow = Math.min(range.endRow, row + 31);
      const request = sourceRange({ ...range, startRow: row, endRow });
      const data = await source.getRange(id, request, signal);
      // 大合并可能扩展返回范围，一次消费已经读取的行，避免重复解析同一区域。
      endRow = Math.max(endRow, Math.min(range.endRow, data.range.endRow - 1));
      const release = source.retainRange(id, data.range);
      try {
        const values = new Map(
          data.cells
            .filter((cell) => !cell.hiddenByMerge)
            .map((cell) => [
              cell.rowIndex + ':' + cell.columnIndex,
              cell.value,
            ]),
        );
        for (const merge of data.merges)
          for (
            let r = Math.max(row + 1, merge.startRow);
            r <= Math.min(endRow + 1, merge.endRow);
            r++
          )
            for (
              let c = Math.max(range.startColumn + 1, merge.startColumn);
              c <= Math.min(range.endColumn + 1, merge.endColumn);
              c++
            )
              if (r !== merge.startRow || c !== merge.startColumn)
                values.delete(r + ':' + c);
        for (let r = row; r <= endRow; r++) {
          if (signal.aborted) throw signal.reason;
          yield Array.from(
            { length: range.endColumn - range.startColumn + 1 },
            (_, column) =>
              values.get(r + 1 + ':' + (range.startColumn + column + 1)) ?? '',
          );
        }
      } finally {
        release();
      }
      row = endRow + 1;
    }
  }
  /** 预览操作失败使用非阻塞通知，不把会话切换成错误页。 */
  private error = (error: unknown) => {
    if (this.closed || !this.active) return;
    if ((error as Error)?.name === 'AbortError') return;
    const host = this.options.geometry().host;
    if (
      host.parentElement &&
      this.notice.element.parentElement !== host.parentElement
    )
      host.parentElement.append(this.notice.element);
    this.notice.update(
      ++this.noticeId,
      error instanceof Error ? error.message : String(error),
      this.options.context.locale,
    );
  };
  private publishWidths() {
    const changed = this.options.widths().length > 0;
    if (this.publishedWidths === changed) return;
    this.publishedWidths = changed;
    this.options.context.services.state.updateGrid?.({
      columnWidthsChanged: changed,
    });
  }
  copy(): Promise<void> {
    return this.controller.copy().catch(this.error);
  }
  resetColumns(): void {
    this.resizing.setActive(false);
    this.options.clearWidths();
    this.resizing.setActive(true);
    this.publishWidths();
  }
  refresh(): void {
    this.controller.updateLocale(this.options.context.locale);
    this.controller.refresh();
    this.resizing.refresh();
  }
  setActive(active: boolean): void {
    this.active = active;
    this.resizing.setActive(active);
    this.controller.setActive(active);
    this.notice.setActive(active);
  }
  dispose(): void {
    this.closed = true;
    this.resizing.dispose();
    this.controller.dispose();
    this.notice.dispose();
  }
}
