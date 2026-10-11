import type { OfficeAnnotationTarget } from '../../engine/annotations/types';
import type { OfficeSearchTarget } from '../../engine/search/types';

/** 只显示已知的文档位置；渐进分页尚未定位时不猜测页码。 */
export function panelLocation(
  target: OfficeSearchTarget | OfficeAnnotationTarget,
  en: boolean,
  sheetName?: string,
) {
  if (target.kind === 'word' || target.kind === 'word-range')
    return target.pageIndex === undefined
      ? en
        ? 'Document text'
        : '正文'
      : en
      ? 'Page ' + (target.pageIndex + 1)
      : '第 ' + (target.pageIndex + 1) + ' 页';
  if (target.kind === 'presentation' || target.kind === 'presentation-element')
    return target.slideIndex === undefined
      ? en
        ? 'Slide'
        : '幻灯片'
      : en
      ? 'Slide ' + (target.slideIndex + 1)
      : '第 ' + (target.slideIndex + 1) + ' 页';
  let column =
    target.kind === 'spreadsheet' ? target.columnIndex : target.column;
  let address = '';
  while (column > 0) {
    column--;
    address = String.fromCharCode(65 + (column % 26)) + address;
    column = Math.floor(column / 26);
  }
  address += target.kind === 'spreadsheet' ? target.rowIndex : target.row;
  return [sheetName, address].filter(Boolean).join(' · ');
}

/** 列表项保留位置、作者和正文层级，所有外部文本均通过 textContent 写入。 */
export function fillPanelEntry(
  button: HTMLButtonElement,
  meta: string,
  text: string,
  author?: string,
) {
  const document = button.ownerDocument;
  const metadata = document.createElement('span');
  metadata.className = 'fivo-native-result-meta';
  metadata.textContent = meta;
  if (author) {
    const by = document.createElement('strong');
    by.className = 'fivo-native-result-author';
    by.textContent = author;
    button.append(by);
  }
  const content = document.createElement('span');
  content.className = 'fivo-native-result-text';
  content.textContent = text;
  button.append(metadata, content);
}
