import type { SpreadsheetAxisIndex } from '../engine/spreadsheet/SpreadsheetAxisIndex';
import { PageHeightIndex } from './PageHeightIndex';
/** Word/PPT 使用原有高度前缀索引，不把页面高度固定为统一常量。 */
export class VirtualWindow {
  readonly heights: PageHeightIndex;
  constructor(heights: number[]) {
    this.heights = new PageHeightIndex(heights);
  }
  range(offset: number, size: number, overscan = 1) {
    if (!this.heights.length || size <= 0)
      return { start: 0, end: 0, offset: 0, total: this.heights.total() };
    const padding = Math.max(0, Math.trunc(overscan));
    const start = Math.max(
      0,
      this.heights.findIndexAtOffset(Math.max(0, offset)) - padding,
    );
    const end = Math.min(
      this.heights.length,
      this.heights.findIndexAtOffset(Math.max(0, offset) + size) + 1 + padding,
    );
    return {
      start,
      end,
      offset: this.heights.prefix(start),
      total: this.heights.total(),
    };
  }
}
/** 表格保留一基行列索引和稀疏度量，避免为 Excel 最大范围分配数组。 */
export function spreadsheetWindow(
  axis: SpreadsheetAxisIndex,
  count: number,
  offset: number,
  size: number,
  overscan = 1,
) {
  const start = Math.max(
    1,
    axis.findIndexAtOffset(Math.max(0, offset)) - overscan,
  );
  const end = Math.min(
    count + 1,
    axis.findIndexAtOffset(Math.max(0, offset) + Math.max(0, size)) +
      1 +
      overscan,
  );
  return {
    start,
    end,
    offset: axis.offsetAt(start),
    total: axis.offsetAt(count) + axis.sizeAt(count),
  };
}
