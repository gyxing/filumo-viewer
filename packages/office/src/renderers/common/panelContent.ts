import type {
  OfficeAnnotation,
  OfficeAnnotationTarget,
} from '../../engine/annotations/types';
import { findSearchMatches } from '../../engine/search/normalizeSearchText';
import type {
  OfficeSearchQuery,
  OfficeSearchTarget,
} from '../../engine/search/types';

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

/** 列表项按既有搜索规则高亮片段，外部文本只作为文本节点写入。 */
export function fillPanelEntry(
  button: HTMLButtonElement,
  meta: string,
  text: string,
  author?: string,
  highlight?: OfficeSearchQuery,
) {
  const document = button.ownerDocument;
  const metadata = document.createElement('span');
  metadata.className = 'filumo-native-result-meta';
  metadata.textContent = meta;
  if (author) {
    const by = document.createElement('strong');
    by.className = 'filumo-native-result-author';
    by.textContent = author;
    button.append(by);
  }
  const content = document.createElement('span');
  content.className = 'filumo-native-result-text';
  let offset = 0;
  for (const hit of highlight ? findSearchMatches(text, highlight) : []) {
    content.append(
      document.createTextNode(text.slice(offset, hit.startOffset)),
    );
    const mark = document.createElement('mark');
    mark.className = 'filumo-native-search-hit';
    mark.textContent = text.slice(hit.startOffset, hit.endOffset);
    content.append(mark);
    offset = hit.endOffset;
  }
  content.append(document.createTextNode(text.slice(offset)));
  button.append(metadata, content);
}

/** 批注卡片保留作者、定位和源文件状态；缺失或无法解析的日期不伪造时间。 */
export function fillReviewEntry(
  button: HTMLButtonElement,
  meta: string,
  annotation: OfficeAnnotation | undefined,
  locale: 'zh-CN' | 'en-US',
  labels: { unknownAuthor: string; emptyComment: string; resolved: string },
) {
  const document = button.ownerDocument;
  const heading = document.createElement('span');
  heading.className = 'filumo-native-review-heading';
  const author = document.createElement('strong');
  author.className = 'filumo-native-result-author';
  author.textContent = annotation?.author?.trim() || labels.unknownAuthor;
  const location = document.createElement('span');
  location.className = 'filumo-native-result-meta';
  location.textContent = meta;
  heading.append(author, location);
  const content = document.createElement('span');
  content.className = 'filumo-native-result-text';
  content.textContent = annotation
    ? annotation.text || labels.emptyComment
    : locale === 'en-US'
    ? 'Loading'
    : '正在读取';
  const footer = document.createElement('span');
  footer.className = 'filumo-native-review-footer';
  if (annotation?.createdAt) {
    const time = document.createElement('time');
    const date = new Date(annotation.createdAt);
    if (Number.isNaN(date.getTime())) {
      time.textContent = annotation.createdAt;
    } else {
      time.dateTime = date.toISOString();
      time.textContent = date.toLocaleDateString(locale);
      time.title = date.toLocaleString(locale);
    }
    footer.append(time);
  }
  if (annotation?.resolved) {
    const resolved = document.createElement('span');
    resolved.className = 'filumo-native-review-resolved';
    resolved.textContent = labels.resolved;
    footer.append(resolved);
  }
  button.append(heading, content, footer);
}
