let sequence = 0;

/** 统一网格实例缩放和调度键，避免 DOM 编排代码重复维护标识规则。 */
export function normalizeSpreadsheetGridScale(zoom: number) {
  return Math.max(0.01, zoom / 100);
}

export function createSpreadsheetGridKey(sheetId: string) {
  return 'sheet-' + sheetId + '-' + ++sequence;
}
