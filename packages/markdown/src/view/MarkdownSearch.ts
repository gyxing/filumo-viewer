import type { TextMatch } from '@fivo/text/reader';
import { findTextMatches } from '@fivo/text/reader';

/** 查找维护查询和文字范围，定位操作交给阅读导航，避免耦合内容构建。 */
export class MarkdownSearch {
  readonly element: HTMLDivElement;
  private query: HTMLInputElement;
  private count: HTMLOutputElement;
  private searchAbort = new AbortController();
  private matches: TextMatch[] = [];
  private matchIndex = -1;
  private active = true;
  constructor(
    private article: HTMLElement,
    private en: boolean,
    private openAncestors: (element: HTMLElement | null) => void,
    private revealRect: (rect: DOMRect, align: 'start' | 'center') => void,
  ) {
    const document = article.ownerDocument;
    this.element = document.createElement('div');
    this.element.className = 'fivo-markdown-find';
    this.element.hidden = true;
    this.query = document.createElement('input');
    this.query.type = 'search';
    this.query.placeholder = this.en ? 'Find in document' : '查找文档';
    this.query.setAttribute('aria-label', this.query.placeholder);
    this.query.oninput = () => {
      void this.search();
    };
    this.query.onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.moveMatch(event.shiftKey ? -1 : 1);
      }
    };
    this.count = document.createElement('output');
    this.count.setAttribute('role', 'status');
    const button = (label: string, run: () => void) => {
      const control = document.createElement('button');
      control.type = 'button';
      control.textContent = label;
      control.onclick = run;
      return control;
    };
    this.element.append(
      this.query,
      button(this.en ? 'Previous' : '上一项', () => this.moveMatch(-1)),
      button(this.en ? 'Next' : '下一项', () => this.moveMatch(1)),
      this.count,
      button(this.en ? 'Close' : '关闭', () => {
        this.element.hidden = true;
        this.searchAbort.abort();
      }),
    );
  }
  private textNodes() {
    const nodes: Array<{ node: Text; start: number; end: number }> = [];
    let text = '';
    const walker = this.article.ownerDocument.createTreeWalker(this.article, 4);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest('[data-search-exclude], button'))
        continue;
      const value = node.textContent ?? '';
      nodes.push({
        node: node as Text,
        start: text.length,
        end: text.length + value.length,
      });
      text += value;
    }
    return { nodes, text };
  }
  private async search() {
    if (!this.active) return;
    this.searchAbort.abort();
    const controller = (this.searchAbort = new AbortController());
    this.matches = [];
    this.matchIndex = -1;
    this.count.textContent = '';
    if (!this.query.value) return;
    const { text } = this.textNodes();
    try {
      for await (const batch of findTextMatches(
        {
          text,
          encoding: 'utf-8',
          lineStarts: Uint32Array.of(0),
          newline: 'none',
        },
        this.query.value,
        { matchCase: false, wholeWord: false },
        controller.signal,
      )) {
        if (!this.active || controller.signal.aborted) return;
        this.matches.push(...batch);
        this.count.textContent = String(this.matches.length);
      }
      if (!this.active || controller.signal.aborted) return;
      if (this.matches.length) this.moveMatch(1);
      else this.count.textContent = this.en ? 'No matches' : '未找到';
    } catch (error) {
      if (!controller.signal.aborted) this.count.textContent = String(error);
    }
  }
  private moveMatch(delta: number) {
    if (!this.active || !this.matches.length) return;
    this.matchIndex =
      (this.matchIndex + delta + this.matches.length) % this.matches.length;
    const hit = this.matches[this.matchIndex],
      { nodes } = this.textNodes();
    const start = nodes.find((item) => item.end > hit.start),
      end = nodes.find((item) => item.end >= hit.end);
    if (start && end) {
      this.openAncestors(start.node.parentElement);
      const range = this.article.ownerDocument.createRange();
      range.setStart(start.node, hit.start - start.start);
      range.setEnd(end.node, hit.end - end.start);
      const selection = this.article.ownerDocument.defaultView?.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      this.revealRect(range.getBoundingClientRect(), 'center');
    }
    this.count.textContent = this.matchIndex + 1 + ' / ' + this.matches.length;
  }

  /** 打开查找不主动执行扫描，输入后才创建任务。 */
  show(): void {
    this.element.hidden = false;
    this.query.focus();
  }
  /** 关闭或暂停查找时立即中止当前扫描。 */
  hide(): void {
    this.element.hidden = true;
    this.searchAbort.abort();
  }
  /** 停用期间不继续扫描或定位匹配。 */
  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.searchAbort.abort();
  }
  /** 阅读视图释放后中止扫描并移除查找控件。 */
  dispose(): void {
    this.setActive(false);
    this.element.remove();
  }
}
