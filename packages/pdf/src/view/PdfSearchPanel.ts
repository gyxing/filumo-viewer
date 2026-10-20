import type { PdfSearch } from './PdfSearch';
import { pdfIcon } from './pdfUi';
import './search.less';

// 行高包含结果卡片间距，结果窗口与键盘定位使用同一尺寸。
const RESULT_HEIGHT = 72;

/** 左侧查找面板只管理输入与窗口化结果，查询状态由独立模型持有。 */
export class PdfSearchPanel {
  readonly element: HTMLElement;
  private input: HTMLInputElement;
  private clear: HTMLButtonElement;
  private previous: HTMLButtonElement;
  private next: HTMLButtonElement;
  private count: HTMLOutputElement;
  private status: HTMLElement;
  private list: HTMLElement;
  private canvas: HTMLElement;
  private stop: () => void;
  private active = false;
  private closed = false;
  private frame?: number;
  private resize?: ResizeObserver;
  private queryRevision = -1;
  private navigationRevision = -1;
  constructor(
    document: Document,
    private search: PdfSearch,
    private close: () => void,
    private locale?: 'zh-CN' | 'en-US',
  ) {
    this.element = document.createElement('section');
    this.element.className = 'fivo-pdf-search';
    const field = document.createElement('div');
    field.className = 'fivo-pdf-search-field';
    this.input = document.createElement('input');
    this.input.type = 'search';
    this.clear = document.createElement('button');
    this.clear.type = 'button';
    this.clear.append(pdfIcon(document, 'clear'));
    this.clear.onclick = () => {
      void search.setQuery('');
      this.input.focus();
    };
    field.append(pdfIcon(document, 'search'), this.input, this.clear);
    const navigation = document.createElement('div');
    navigation.className = 'fivo-pdf-search-navigation';
    this.count = document.createElement('output');
    this.count.setAttribute('role', 'status');
    this.previous = document.createElement('button');
    this.next = document.createElement('button');
    this.previous.type = this.next.type = 'button';
    this.previous.append(pdfIcon(document, 'previous'));
    this.next.append(pdfIcon(document, 'next'));
    this.previous.onclick = () => {
      void search.previous();
    };
    this.next.onclick = () => {
      void search.next();
    };
    navigation.append(this.count, this.previous, this.next);
    this.status = document.createElement('div');
    this.status.className = 'fivo-pdf-search-status';
    this.status.setAttribute('role', 'status');
    this.list = document.createElement('div');
    this.list.className = 'fivo-pdf-search-results';
    this.list.setAttribute('role', 'listbox');
    this.list.tabIndex = 0;
    this.canvas = document.createElement('div');
    this.canvas.className = 'fivo-pdf-search-canvas';
    this.list.append(this.canvas);
    this.element.append(field, navigation, this.status, this.list);
    this.input.oninput = () => {
      void search.setQuery(this.input.value);
    };
    this.input.onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void (event.shiftKey ? search.previous() : search.next());
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    };
    this.list.onkeydown = (event) => {
      const state = search.getSnapshot();
      if (!state.resultCount) return;
      let index: number;
      if (event.key === 'ArrowDown')
        index = Math.min(state.resultCount - 1, state.currentIndex + 1);
      else if (event.key === 'ArrowUp')
        index = Math.max(0, state.currentIndex - 1);
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = state.resultCount - 1;
      else return;
      event.preventDefault();
      search.select(index);
    };
    this.list.onscroll = this.schedule;
    const Resize = document.defaultView?.ResizeObserver;
    if (Resize) this.resize = new Resize(this.schedule);
    this.stop = search.subscribe(this.schedule);
    this.update(locale);
  }
  private schedule = () => {
    if (this.closed || !this.active || this.frame !== undefined) return;
    const win = this.element.ownerDocument.defaultView;
    if (win)
      this.frame = win.requestAnimationFrame(() => {
        this.frame = undefined;
        this.render();
      });
    else this.render();
  };
  private render() {
    if (this.closed || !this.active) return;
    const state = this.search.getSnapshot(),
      en = this.locale === 'en-US';
    if (this.input.value !== state.query) this.input.value = state.query;
    this.clear.hidden = !state.query;
    this.previous.disabled = this.next.disabled = !state.resultCount;
    this.count.textContent = state.resultCount
      ? state.currentIndex +
        1 +
        ' / ' +
        state.resultCount +
        (state.truncated ? '+' : '')
      : state.searching
      ? en
        ? 'Searching…'
        : '正在查找…'
      : state.query && state.completed
      ? en
        ? 'No matches'
        : '未找到'
      : '';
    this.status.textContent =
      state.error ??
      (state.truncated
        ? en
          ? 'Result limit reached'
          : '已达到匹配结果上限'
        : state.searching
        ? (en ? 'Scanned ' : '已扫描 ') +
          state.scannedPages +
          ' / ' +
          state.pageCount +
          (en ? ' pages' : ' 页')
        : !state.query
        ? en
          ? 'Enter text to find in this PDF'
          : '输入关键词查找文档内容'
        : !state.resultCount && state.completed
        ? en
          ? 'No matching text. Image-only pages cannot be searched.'
          : '未找到匹配文字，纯图像页面无法搜索文字。'
        : '');
    // 先更新滚动范围，避免新追加结果的定位被旧高度截断。
    this.canvas.style.height = state.resultCount * RESULT_HEIGHT + 'px';
    if (this.queryRevision !== state.queryRevision) {
      this.queryRevision = state.queryRevision;
      this.list.scrollTop = 0;
    }
    if (this.navigationRevision !== state.navigationRevision) {
      this.navigationRevision = state.navigationRevision;
      if (state.currentIndex >= 0) {
        const top = state.currentIndex * RESULT_HEIGHT,
          bottom = top + RESULT_HEIGHT;
        if (top < this.list.scrollTop) this.list.scrollTop = top;
        else if (bottom > this.list.scrollTop + this.list.clientHeight)
          this.list.scrollTop = Math.max(0, bottom - this.list.clientHeight);
      }
    }
    const begin = Math.max(
        0,
        Math.floor(this.list.scrollTop / RESULT_HEIGHT) - 2,
      ),
      end = Math.min(
        state.resultCount,
        Math.ceil(
          (this.list.scrollTop +
            Math.max(RESULT_HEIGHT, this.list.clientHeight)) /
            RESULT_HEIGHT,
        ) + 2,
      );
    const focused = this.element.ownerDocument
        .activeElement as HTMLElement | null,
      restore = !!focused && this.canvas.contains(focused);
    this.canvas.replaceChildren();
    this.search.getResults(begin, end - begin).forEach((hit, offset) => {
      const index = begin + offset,
        document = this.element.ownerDocument,
        button = document.createElement('button'),
        page = document.createElement('span'),
        snippet = document.createElement('span'),
        mark = document.createElement('mark');
      button.type = 'button';
      button.className = 'fivo-pdf-search-result';
      button.style.top = index * RESULT_HEIGHT + 'px';
      button.setAttribute('role', 'option');
      button.setAttribute(
        'aria-selected',
        String(index === state.currentIndex),
      );
      button.setAttribute('aria-posinset', String(index + 1));
      button.setAttribute('aria-setsize', String(state.resultCount));
      button.tabIndex = index === state.currentIndex ? 0 : -1;
      page.className = 'fivo-pdf-search-page';
      page.textContent = en
        ? 'Page ' + (hit.pageIndex + 1)
        : '第 ' + (hit.pageIndex + 1) + ' 页';
      snippet.className = 'fivo-pdf-search-snippet';
      mark.textContent = hit.preview.match;
      snippet.append(
        document.createTextNode(
          (hit.preview.leading ? '…' : '') + hit.preview.before,
        ),
        mark,
        document.createTextNode(
          hit.preview.after + (hit.preview.trailing ? '…' : ''),
        ),
      );
      button.title =
        page.textContent +
        '：' +
        hit.preview.before +
        hit.preview.match +
        hit.preview.after;
      button.append(page, snippet);
      button.onclick = () => this.search.select(index);
      this.canvas.append(button);
      if (restore && index === state.currentIndex)
        button.focus({ preventScroll: true });
    });
    if (
      restore &&
      !this.canvas.contains(this.element.ownerDocument.activeElement)
    )
      this.list.focus({ preventScroll: true });
  }
  focus(): void {
    if (!this.closed) this.input.focus({ preventScroll: true });
  }
  update(locale?: 'zh-CN' | 'en-US'): void {
    this.locale = locale;
    const en = locale === 'en-US';
    this.input.placeholder = en ? 'Find in PDF' : '查找 PDF';
    this.input.setAttribute('aria-label', en ? 'Find in PDF' : '查找 PDF');
    this.list.setAttribute('aria-label', en ? 'Search results' : '查找结果');
    for (const [node, label] of [
      [this.clear, en ? 'Clear search' : '清空查找'],
      [this.previous, en ? 'Previous result' : '上一项'],
      [this.next, en ? 'Next result' : '下一项'],
    ] as const) {
      node.title = label;
      node.setAttribute('aria-label', label);
    }
    this.schedule();
  }
  setActive(value: boolean): void {
    if (this.closed) return;
    this.active = value;
    if (value) {
      this.resize?.observe(this.list);
      this.schedule();
    } else {
      this.resize?.disconnect();
      if (this.frame !== undefined)
        this.element.ownerDocument.defaultView?.cancelAnimationFrame(
          this.frame,
        );
      this.frame = undefined;
    }
  }
  dispose(): void {
    if (this.closed) return;
    this.setActive(false);
    this.closed = true;
    this.stop();
    this.resize?.disconnect();
    this.element.remove();
  }
}
