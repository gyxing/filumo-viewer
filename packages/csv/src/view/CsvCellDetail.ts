/** 单元格详情只截断显示，不改变会话内原文或复制值。 */
export class CsvCellDetail {
  readonly element: HTMLElement;
  constructor(document: Document) {
    this.element = document.createElement('div');
    this.element.className = 'filumo-csv-detail';
    this.element.setAttribute('role', 'status');
  }
  update(
    row: number,
    column: number,
    value: string,
    truncated: boolean,
    en: boolean,
  ): void {
    this.element.textContent =
      (en
        ? `Row ${row + 1}, column ${column + 1}: `
        : `第 ${row + 1} 行，第 ${column + 1} 列：`) +
      value +
      (truncated
        ? en
          ? ' … (display truncated)'
          : ' …（显示已截断，复制保留完整值）'
        : '');
  }
}
