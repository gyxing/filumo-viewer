import type { GridPoint, GridRange, GridState } from './contracts';

/** 范围为空时不制造虚构单元格，所有边界均包含结束坐标。 */
export function validGridRange(range?: GridRange): range is GridRange {
  return (
    !!range &&
    [range.startRow, range.endRow, range.startColumn, range.endColumn].every(
      Number.isSafeInteger,
    ) &&
    range.startRow >= 0 &&
    range.startColumn >= 0 &&
    range.startRow <= range.endRow &&
    range.startColumn <= range.endColumn
  );
}
/** 将源坐标夹到正文范围，CSV 表头偏移由边界描述。 */
export function clampGridPoint(point: GridPoint, bounds: GridRange): GridPoint {
  return {
    row: Math.max(
      bounds.startRow,
      Math.min(
        bounds.endRow,
        Number.isSafeInteger(point.row) ? point.row : bounds.startRow,
      ),
    ),
    column: Math.max(
      bounds.startColumn,
      Math.min(
        bounds.endColumn,
        Number.isSafeInteger(point.column) ? point.column : bounds.startColumn,
      ),
    ),
  };
}
/** 逻辑选择独立于可见 DOM，虚拟窗口重绘不丢失反向扩选锚点。 */
export class GridSelection {
  private fullRange?: GridRange;
  anchor?: GridPoint;
  focus?: GridPoint;
  constructor(state?: GridState) {
    this.fullRange = state?.range && { ...state.range };
    this.anchor = state?.anchor && { ...state.anchor };
    this.focus = state?.focus && { ...state.focus };
  }
  select(point: GridPoint, extend: boolean, bounds?: GridRange): void {
    this.fullRange = undefined;
    const next = bounds ? clampGridPoint(point, bounds) : { ...point };
    if (!extend || !this.anchor) this.anchor = { ...next };
    this.focus = next;
  }
  clamp(bounds?: GridRange): void {
    if (!validGridRange(bounds)) {
      this.fullRange = undefined;
      this.anchor = this.focus = undefined;
      return;
    }
    this.anchor = clampGridPoint(
      this.anchor ?? { row: bounds.startRow, column: bounds.startColumn },
      bounds,
    );
    this.focus = clampGridPoint(this.focus ?? this.anchor, bounds);
    if (this.fullRange) {
      this.fullRange = {
        startRow: Math.max(bounds.startRow, this.fullRange.startRow),
        endRow: Math.min(bounds.endRow, this.fullRange.endRow),
        startColumn: Math.max(bounds.startColumn, this.fullRange.startColumn),
        endColumn: Math.min(bounds.endColumn, this.fullRange.endColumn),
      };
      if (!validGridRange(this.fullRange)) this.fullRange = undefined;
    }
  }
  /** 全选只保存边界，保持当前活动位置，隐藏尾行尾列也能完整复制。 */
  selectAll(bounds: GridRange): void {
    this.clamp(bounds);
    this.fullRange = { ...bounds };
  }
  get range(): GridRange | undefined {
    if (this.fullRange) return { ...this.fullRange };
    if (!this.anchor || !this.focus) return undefined;
    return {
      startRow: Math.min(this.anchor.row, this.focus.row),
      endRow: Math.max(this.anchor.row, this.focus.row),
      startColumn: Math.min(this.anchor.column, this.focus.column),
      endColumn: Math.max(this.anchor.column, this.focus.column),
    };
  }
  contains(row: number, column: number): boolean {
    const range = this.range;
    return (
      !!range &&
      row >= range.startRow &&
      row <= range.endRow &&
      column >= range.startColumn &&
      column <= range.endColumn
    );
  }
  getState(): GridState {
    return {
      range: this.fullRange && { ...this.fullRange },
      anchor: this.anchor && { ...this.anchor },
      focus: this.focus && { ...this.focus },
    };
  }
}
