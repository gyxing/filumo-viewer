/** 在重建后的正文中检索，标记跨节点匹配，不滚动外层宿主页。 */
export class HtmlSearch {
  readonly element: HTMLElement;
  private input: HTMLInputElement;
  private count: HTMLElement;
  private query = '';
  private matches: HTMLElement[][] = [];
  private current = -1;
  constructor(
    private article: HTMLElement,
    private scroller: HTMLElement,
    private changed: () => void,
    private en: boolean,
  ) {
    const d = article.ownerDocument;
    this.element = d.createElement('div');
    this.element.className = 'filumo-html-find';
    this.element.hidden = true;
    this.input = d.createElement('input');
    this.input.placeholder = en ? 'Find in document' : '查找文档';
    this.input.setAttribute('aria-label', this.input.placeholder);
    this.input.oninput = () => this.setQuery(this.input.value);
    this.input.onkeydown = (e) => {
      if (e.key === 'Escape') {
        this.show(false);
        e.preventDefault();
      }
      if (e.key === 'Enter') {
        this.move(e.shiftKey ? -1 : 1);
        e.preventDefault();
      }
    };
    this.count = d.createElement('span');
    this.count.setAttribute('aria-live', 'polite');
    const button = (label: string, text: string, run: () => void) => {
      const b = d.createElement('button');
      b.type = 'button';
      b.title = label;
      b.setAttribute('aria-label', label);
      const svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '16');
      svg.setAttribute('height', '16');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.8');
      svg.setAttribute('aria-hidden', 'true');
      const path = d.createElementNS(svg.namespaceURI, 'path');
      path.setAttribute(
        'd',
        text === '↑'
          ? 'm6 15 6-6 6 6'
          : text === '↓'
          ? 'm6 9 6 6 6-6'
          : 'M6 6l12 12M6 18 18 6',
      );
      svg.append(path);
      b.append(svg);
      b.onclick = run;
      return b;
    };
    this.element.append(
      this.input,
      this.count,
      button(en ? 'Previous' : '上一处', '↑', () => this.move(-1)),
      button(en ? 'Next' : '下一处', '↓', () => this.move(1)),
      button(en ? 'Close' : '关闭', '×', () => this.show(false)),
    );
  }
  show(value: boolean) {
    this.element.hidden = !value;
    if (value) this.input.focus({ preventScroll: true });
  }
  /** 搜索内容与位置保持不变，仅切换控件的可访问名称。 */
  setLocale(en:boolean){this.en=en;this.input.placeholder=en?'Find in document':'查找文档';this.input.setAttribute('aria-label',this.input.placeholder);const labels=en?['Previous','Next','Close']:['上一处','下一处','关闭'];this.element.querySelectorAll('button').forEach((button,index)=>{button.title=labels[index];button.setAttribute('aria-label',labels[index]);});}
  clear() {
    for (const group of this.matches)
      for (const mark of group)
        mark.replaceWith(
          mark.ownerDocument.createTextNode(mark.textContent ?? ''),
        );
    this.matches = [];
    this.current = -1;
    this.article.normalize();
  }
  setQuery(value: string) {
    this.clear();
    this.query = value.slice(0, 512);
    this.input.value = this.query;
    this.show(true);
    if (this.query) {
      const nodes: Array<{ node: Text; start: number }> = [];
      let text = '';
      const walker = this.article.ownerDocument.createTreeWalker(
        this.article,
        4,
      );
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const node = n as Text;
        nodes.push({ node, start: text.length });
        text += node.data;
      }
      const regex = new RegExp(
        this.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'giu',
      );
      const positions = [...text.matchAll(regex)]
        .slice(0, 10000)
        .map((m) => ({ start: m.index!, end: m.index! + m[0].length }));
      this.matches = positions.map(() => []);
      for (const { node, start } of nodes.reverse())
        for (let i = positions.length - 1; i >= 0; i--) {
          const p = positions[i],
            a = Math.max(0, p.start - start),
            b = Math.min(node.length, p.end - start);
          if (b <= a) continue;
          const segment = node.splitText(a);
          segment.splitText(b - a);
          const mark = node.ownerDocument.createElement('mark');
          mark.textContent = segment.data;
          segment.replaceWith(mark);
          this.matches[i].unshift(mark);
        }
      if (this.matches.length) this.current = 0;
    }
    this.reveal();
    this.changed();
  }
  move(delta: number) {
    if (this.matches.length) {
      this.current =
        (this.current + delta + this.matches.length) % this.matches.length;
      this.reveal();
      this.changed();
    }
  }
  private reveal() {
    this.count.textContent = this.matches.length
      ? `${this.current + 1} / ${this.matches.length}`
      : '0 / 0';
    for (let i = 0; i < this.matches.length; i++)
      for (const mark of this.matches[i])
        mark.classList.toggle('is-current', i === this.current);
    const target = this.matches[this.current]?.[0];
    if (target) {
      const a = target.getBoundingClientRect(),
        b = this.scroller.getBoundingClientRect();
      if (a.top < b.top || a.bottom > b.bottom)
        this.scroller.scrollTop += a.top - b.top - 32;
    }
  }
  capabilities() {
    return {
      query: this.query,
      resultCount: this.matches.length,
      currentIndex: this.current,
      searching: false,
      setQuery: async (value: string) => this.setQuery(value),
      next: async () => this.move(1),
      previous: async () => this.move(-1),
    };
  }
  dispose() {
    this.clear();
    this.element.remove();
  }
}
