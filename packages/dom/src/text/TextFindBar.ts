/** 查找控件只处理交互，查询任务和结果窗口由当前阅读器拥有。 */
export class TextFindBar {
  readonly element: HTMLDivElement;
  readonly query: HTMLInputElement;
  readonly status: HTMLOutputElement;
  readonly matchCase: HTMLInputElement;
  readonly wholeWord: HTMLInputElement;
  private readonly previous: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly caseLabel: Text;
  private readonly wordLabel: Text;
  constructor(
    document: Document,
    en: boolean,
    search: () => void,
    move: (delta: number) => void,
    close: () => void,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'filumo-text-find';
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
      const text = document.createTextNode(label);
      host.append(input, text);
      return { host, input, text };
    };
    const matchCase = toggle(en ? 'Case' : '区分大小写'),
      wholeWord = toggle(en ? 'Whole word' : '全词');
    this.matchCase = matchCase.input;
    this.wholeWord = wholeWord.input;
    this.caseLabel = matchCase.text;
    this.wordLabel = wholeWord.text;
    this.previous = make('', () => move(-1));
    this.next = make('', () => move(1));
    this.closeButton = make('', () => {
      this.element.hidden = true;
      close();
    });
    this.updateLocale(en);
    this.element.append(
      this.query,
      this.previous,
      this.next,
      matchCase.host,
      wholeWord.host,
      this.status,
      this.closeButton,
    );
  }
  /** 只更新文案，保留输入焦点、查询内容和开关状态。 */
  updateLocale(en: boolean): void {
    this.query.placeholder = en ? 'Find text' : '查找文本';
    this.query.setAttribute('aria-label', this.query.placeholder);
    this.previous.textContent = en ? 'Previous' : '上一项';
    this.next.textContent = en ? 'Next' : '下一项';
    this.closeButton.textContent = en ? 'Close' : '关闭';
    this.caseLabel.data = en ? 'Case' : '区分大小写';
    this.wordLabel.data = en ? 'Whole word' : '全词';
  }
}
