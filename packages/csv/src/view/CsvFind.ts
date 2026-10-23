import { findTextMatches } from '@filumo/core/text';
import { createGridIcon } from '@filumo/dom/grid';
import type { CsvSession } from '../runtime/CsvSession';
import type { CsvIndex } from '../parser/types';

/** 查找使用文件偏移，再映射到逻辑记录，引用内换行不影响定位。 */
export class CsvFind {
  readonly element: HTMLElement;
  readonly input: HTMLInputElement;
  private status: HTMLElement;
  private matches: number[] = [];
  private current = -1;
  private abort = new AbortController();
  private closed = false;
  private searching = false;
  private resume = false;
  constructor(
    document: Document,
    private session: CsvSession,
    private index: CsvIndex,
    private reveal: (row: number, column: number) => void,
    private error: (error: unknown) => void,
    en: boolean,
    private onClose: () => void = () => undefined,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'filumo-csv-find';
    this.element.setAttribute('role', 'search');
    this.element.hidden = true;
    this.input = document.createElement('input');
    this.input.type = 'search';
    this.input.placeholder = en ? 'Find text' : '查找文本';
    this.input.setAttribute('aria-label', this.input.placeholder);
    this.status = document.createElement('output');
    this.status.setAttribute('role', 'status');
    const button = (
      label: string,
      icon: 'previous' | 'next' | 'close',
      run: () => void,
    ) => {
      const node = document.createElement('button');
      node.type = 'button';
      node.setAttribute('aria-label', label);
      node.title = label;
      node.append(createGridIcon(document, icon));
      node.disabled = icon !== 'close';
      node.onclick = run;
      return node;
    };
    this.input.oninput = () => {
      void this.search().catch(this.handleError);
    };
    this.input.onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.move(event.shiftKey ? -1 : 1);
      } else if (event.key === 'Escape') this.show(false);
    };
    const field = document.createElement('div');
    field.className = 'filumo-csv-find-field';
    field.append(createGridIcon(document, 'search'), this.input);
    this.element.append(
      field,
      button(en ? 'Previous' : '上一项', 'previous', () => this.move(-1)),
      button(en ? 'Next' : '下一项', 'next', () => this.move(1)),
      this.status,
      button(en ? 'Close' : '关闭', 'close', () => this.show(false)),
    );
  }
  private handleError = (error: unknown) => {
    if (!this.closed && (error as { name?: string })?.name !== 'AbortError')
      this.error(error);
  };
  private async search() {
    this.searching = true;
    this.resume = false;
    this.abort.abort();
    const own = (this.abort = new AbortController()),
      document = this.session.content.document!;
    this.matches = [];
    this.current = -1;
    this.status.textContent = '';
    for await (const batch of findTextMatches(
      document,
      this.input.value,
      { matchCase: false, wholeWord: false },
      own.signal,
    )) {
      if (this.closed || own.signal.aborted) return;
      this.matches.push(
        ...batch
          .slice(0, 10000 - this.matches.length)
          .map((match) => match.start),
      );
      if (this.matches.length >= 10000) break;
    }
    if (this.closed || own.signal.aborted) return;
    this.searching = false;
    this.current = this.matches.length ? 0 : -1;
    await this.locate(own.signal);
  }
  private async locate(signal: AbortSignal) {
    this.status.textContent = !this.input.value
      ? ''
      : this.matches.length
      ? `${this.current + 1}/${this.matches.length}${
          this.matches.length === 10000 ? '+' : ''
        }`
      : '0';
    this.element.querySelectorAll('button').forEach((button, index) => {
      if (index < 2) button.disabled = !this.matches.length;
    });
    if (this.current < 0) return;
    const offset = this.matches[this.current];
    let begin = 0,
      end = this.index.rowStarts.length;
    while (begin < end) {
      const mid = (begin + end) >>> 1;
      if (this.index.rowStarts[mid] <= offset) begin = mid + 1;
      else end = mid;
    }
    const row = Math.max(0, begin - 1),
      fields = await this.session.getRow(row, signal);
    if (!signal.aborted && !this.closed)
      this.reveal(
        row,
        Math.max(
          0,
          fields.findIndex(
            (cell) => offset >= cell.start && offset <= cell.end,
          ),
        ),
      );
  }
  private move(delta: number) {
    if (!this.matches.length) return;
    this.current =
      (this.current + delta + this.matches.length) % this.matches.length;
    void this.locate(this.abort.signal).catch(this.handleError);
  }
  show(open: boolean): void {
    this.element.hidden = !open;
    this.setActive(open);
    if (open) this.input.focus();
    else this.onClose();
  }
  /** 语言变化只更新文案，不清空查询和已找到的位置。 */
  updateLocale(en: boolean): void {
    this.input.placeholder = en ? 'Find text' : '查找文本';
    this.input.setAttribute('aria-label', this.input.placeholder);
    const labels = en
      ? ['Previous', 'Next', 'Close']
      : ['上一项', '下一项', '关闭'];
    this.element.querySelectorAll('button').forEach((button, index) => {
      button.setAttribute('aria-label', labels[index]);
      button.title = labels[index];
    });
  }
  setActive(active: boolean): void {
    if (!active) {
      this.resume = this.searching;
      this.abort.abort();
    } else if (this.resume && this.input.value)
      void this.search().catch(this.handleError);
    else if (this.abort.signal.aborted) this.abort = new AbortController();
  }
  dispose(): void {
    this.closed = true;
    this.abort.abort();
    this.input.oninput = null;
    this.input.onkeydown = null;
    this.element.remove();
  }
}
