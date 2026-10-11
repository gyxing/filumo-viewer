export interface SpreadsheetGridDom {
  element: HTMLDivElement;
  canvas: HTMLDivElement;
  cells: HTMLDivElement;
  frozen: HTMLDivElement;
  objects: HTMLDivElement;
  headers: HTMLDivElement;
  status: HTMLDivElement;
}

/** 创建表格网格的固定 DOM 骨架，网格状态和布局计算由 SpreadsheetGrid 持有。 */
export function createSpreadsheetGridDom(document: Document): SpreadsheetGridDom {
  const element = document.createElement('div');
  element.className =
    'office-file-xlsx-sheet-grid office-file-xlsx-virtual-grid';
  element.style.height = '100%';
  element.style.boxSizing = 'border-box';
  const canvas = document.createElement('div');
  canvas.className =
    'office-file-xlsx-sheet-grid__canvas office-file-xlsx-virtual-grid__canvas';
  canvas.dataset.officeFitTarget = 'true';
  const cells = document.createElement('div');
  const frozen = document.createElement('div');
  const objects = document.createElement('div');
  const headers = document.createElement('div');
  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  canvas.append(cells, frozen, objects, headers);
  element.append(canvas, status);
  return { element, canvas, cells, frozen, objects, headers, status };
}
