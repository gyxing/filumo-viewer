/** 查找控件只处理交互，查询任务和结果窗口由当前阅读器拥有。 */
export class TextFindBar {
  readonly element: HTMLDivElement;
  readonly query: HTMLInputElement;
  readonly status: HTMLOutputElement;
  readonly matchCase: HTMLInputElement;
  readonly wholeWord: HTMLInputElement;
  constructor(
    document: Document,
    en: boolean,
    search: () => void,
    move: (delta: number) => void,
    close: () => void,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'fivo-text-find';
    this.element.hidden = true;
    this.query = document.createElement('input');
    this.query.type = 'search';
    this.query.placeholder = en ? 'Find text' : '查找文本';
    this.query.setAttribute('aria-label', this.query.placeholder);
    this.query.oninput = search;
    this.query.onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        move(event.shiftKey ? -1 : 1);
      }
    };
    this.status = document.createElement('output');
    this.status.setAttribute('role', 'status');
    const make = (label: string, run: () => void) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.onclick = run;
      return button;
    };
    const toggle = (label: string) => {
      const host = document.createElement('label'),
        input = document.createElement('input');
      input.type = 'checkbox';
      input.onchange = search;
      host.append(input, label);
      return { host, input };
    };
    const matchCase = toggle(en ? 'Case' : '区分大小写'),
      wholeWord = toggle(en ? 'Whole word' : '全词');
    this.matchCase = matchCase.input;
    this.wholeWord = wholeWord.input;
    this.element.append(
      this.query,
      make(en ? 'Previous' : '上一项', () => move(-1)),
      make(en ? 'Next' : '下一项', () => move(1)),
      matchCase.host,
      wholeWord.host,
      this.status,
      make(en ? 'Close' : '关闭', () => {
        this.element.hidden = true;
        close();
      }),
    );
  }
}
