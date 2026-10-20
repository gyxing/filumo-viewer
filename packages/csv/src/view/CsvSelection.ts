export interface CsvPoint {
  row: number;
  column: number;
}
/** 选择独立于可见 DOM，滚动及异步字段回写不重置选区。 */
export class CsvSelection {
  anchor: CsvPoint = { row: 0, column: 0 };
  focus: CsvPoint = { row: 0, column: 0 };
  select(point: CsvPoint, extend: boolean): void {
    if (!extend) this.anchor = { ...point };
    this.focus = { ...point };
  }
  contains(row: number, column: number): boolean {
    return (
      row >= Math.min(this.anchor.row, this.focus.row) &&
      row <= Math.max(this.anchor.row, this.focus.row) &&
      column >= Math.min(this.anchor.column, this.focus.column) &&
      column <= Math.max(this.anchor.column, this.focus.column)
    );
  }
}
