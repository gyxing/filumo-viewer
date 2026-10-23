import type { SpreadsheetMerge, SpreadsheetRange } from './types';

/** 判断两个包含结束位置的工作表范围是否相交。 */
export function spreadsheetRangesIntersect(
  left: SpreadsheetRange,
  right: SpreadsheetRange,
) {
  return !(
    left.endRow < right.startRow ||
    left.startRow > right.endRow ||
    left.endColumn < right.startColumn ||
    left.startColumn > right.endColumn
  );
}

/** 按行区间查询合并区域，并把虚拟窗口扩展到完整合并范围。 */
export class SpreadsheetMergeIndex {
  private readonly merges: readonly SpreadsheetMerge[];
  private readonly maxEndRows: readonly number[];

  constructor(merges: readonly SpreadsheetMerge[]) {
    this.merges = [...merges].sort(
      (left, right) => left.startRow - right.startRow,
    );
    let max = 0;
    this.maxEndRows = this.merges.map(
      (merge) => (max = Math.max(max, merge.endRow)),
    );
  }

  query(range: SpreadsheetRange) {
    // 指针命中频繁读取结构信息，先跳过确定结束的区域，再扫描相交行段。
    let low = 0,
      high = this.merges.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.maxEndRows[mid] < range.startRow) low = mid + 1;
      else high = mid;
    }
    const result: SpreadsheetMerge[] = [];
    for (
      let index = low;
      index < this.merges.length && this.merges[index].startRow <= range.endRow;
      index++
    )
      if (spreadsheetRangesIntersect(range, this.merges[index]))
        result.push(this.merges[index]);
    return result;
  }

  expand(range: SpreadsheetRange) {
    let expanded = { ...range };
    let changed = true;
    while (changed) {
      changed = false;
      for (const merge of this.query(expanded)) {
        const next = {
          startRow: Math.min(expanded.startRow, merge.startRow),
          endRow: Math.max(expanded.endRow, merge.endRow),
          startColumn: Math.min(expanded.startColumn, merge.startColumn),
          endColumn: Math.max(expanded.endColumn, merge.endColumn),
        };
        if (
          next.startRow !== expanded.startRow ||
          next.endRow !== expanded.endRow ||
          next.startColumn !== expanded.startColumn ||
          next.endColumn !== expanded.endColumn
        ) {
          expanded = next;
          changed = true;
        }
      }
    }
    return expanded;
  }
}
