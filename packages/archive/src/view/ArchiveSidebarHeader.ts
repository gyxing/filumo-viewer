let sequence = 0;
/** 导航栏固定在树上方，文件名搜索不关闭当前子文件预览。 */
export class ArchiveSidebarHeader {
  readonly element: HTMLElement;
  private back: HTMLButtonElement;
  private search: HTMLButtonElement;
  private input: HTMLInputElement;
  private field: HTMLElement;
  constructor(
    document: Document,
    onBack: () => void,
    onQuery: (query: string) => void,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'filumo-archive-sidebar-heading';
    const row = document.createElement('div');
    row.className = 'filumo-archive-sidebar-actions';
    const icon = (path: string) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '16');
      svg.setAttribute('height', '16');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.5');
      svg.setAttribute('aria-hidden', 'true');
      const p = document.createElementNS(svg.namespaceURI, 'path');
      p.setAttribute('d', path);
      svg.append(p);
      return svg;
    };
    this.back = document.createElement('button');
    this.back.type = 'button';
    this.back.className = 'filumo-archive-back';
    this.back.append(
      icon('M12 20V4m-7 7 7-7 7 7'),
      document.createElement('span'),
    );
    this.back.onclick = onBack;
    this.search = document.createElement('button');
    this.search.type = 'button';
    this.search.className = 'filumo-archive-search-toggle';
    this.search.append(
      icon('M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0ZM15.5 15.5 21 21'),
    );
    this.field = document.createElement('div');
    this.field.className = 'filumo-archive-filter';
    this.field.hidden = true;
    this.field.id = 'filumo-archive-filter-' + ++sequence;
    this.search.setAttribute('aria-controls', this.field.id);
    this.search.setAttribute('aria-expanded', 'false');
    this.input = document.createElement('input');
    this.input.type = 'search';
    this.input.oninput = () => onQuery(this.input.value);
    this.field.append(this.input);
    row.append(this.back, this.search);
    this.element.append(row, this.field);
    this.search.onclick = () => {
      this.field.hidden = !this.field.hidden;
      this.search.setAttribute('aria-expanded', String(!this.field.hidden));
      if (!this.field.hidden) this.input.focus({ preventScroll: true });
      else if (this.input.value) {
        this.input.value = '';
        onQuery('');
      }
    };
  }
  update(en: boolean, canGoBack: boolean, query: string) {
    this.back.disabled = !canGoBack;
    this.back.querySelector('span')!.textContent = en
      ? 'Up one level'
      : '返回上级';
    this.back.title = en
      ? 'Return to the containing directory or archive'
      : '返回所在目录或上一层压缩包';
    this.search.title = en ? 'Find files' : '查找文件';
    this.search.setAttribute('aria-label', this.search.title);
    this.input.placeholder = en ? 'Find file names' : '查找文件名';
    this.input.setAttribute('aria-label', this.input.placeholder);
    if (this.input.value !== query) this.input.value = query;
    if (query) {
      this.field.hidden = false;
      this.search.setAttribute('aria-expanded', 'true');
    }
  }
  dispose() {
    this.back.onclick = this.search.onclick = this.input.oninput = null;
    this.element.remove();
  }
}
