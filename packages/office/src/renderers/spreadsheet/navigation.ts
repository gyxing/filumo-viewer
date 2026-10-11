/** 把 A1 或 A1:B2 引用转换为用于导航的左上角坐标。 */
export function parseSpreadsheetCellReference(reference: string) {
  const normalized = reference.replace(/\$/g, '').trim();
  const match = /^([A-Za-z]{1,3})(\d+)(?::[A-Za-z]{1,3}\d+)?$/.exec(normalized);
  if (!match) return undefined;
  const columnIndex = match[1]
    .toUpperCase()
    .split('')
    .reduce((total, character) => total * 26 + character.charCodeAt(0) - 64, 0);
  const rowIndex = Number(match[2]);
  return rowIndex > 0 && columnIndex > 0
    ? { rowIndex, columnIndex }
    : undefined;
}
