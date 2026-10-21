import type { JsonLinesIndex } from '../parser/linesTypes';

/** 记录列表只保留可见行摘要，选择身份与 DOM 窗口分离。 */
export class JsonRecordList {
  readonly element: HTMLElement;
  private canvas: HTMLElement;
  private selected = -1;
  private height = 46;
  private active = true;
  private closed = false;
  private frame?: number;
  private get scrollMetrics() {
    const logicalHeight = this.index.starts.length * this.height;
    const physicalHeight = Math.min(logicalHeight, 8000000);
    const visible = Math.max(1, this.element.clientHeight || 400);
    // 百万记录的轨道需低于浏览器像素上限，实际行仍按原行高绘制。
    return {
      physicalHeight,
      ratio: Math.max(
        1,
        (logicalHeight - visible) / Math.max(1, physicalHeight - visible),
      ),
    };
  }
  private resize?: ResizeObserver;
  constructor(
    private document: Document,
    private text: string,
    private index: JsonLinesIndex,
    private en: boolean,
    private choose: (index: number) => void,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'filumo-json-record-list';
    this.element.setAttribute('role', 'listbox');
    this.element.tabIndex = 0;
    this.canvas = document.createElement('div');
    this.canvas.className = 'filumo-json-record-canvas';
    this.element.append(this.canvas);
    this.element.addEventListener('scroll', this.schedule, { passive: true });
    this.element.addEventListener('keydown', this.key);
    const Resize = document.defaultView?.ResizeObserver;
    if (Resize) {
      this.resize = new Resize(this.schedule);
      this.resize.observe(this.element);
    }
    this.render();
  }
  private schedule = () => {
    if (!this.active || this.closed || this.frame !== undefined) return;
    const window = this.document.defaultView;
    if (window)
      this.frame = window.requestAnimationFrame(() => {
        this.frame = undefined;
        this.render();
      });
    else this.render();
  };
  private render() {
    if (!this.active || this.closed) return;
    this.element.setAttribute(
      'aria-label',
      this.en ? 'JSON records' : 'JSON 记录',
    );
    const metrics = this.scrollMetrics,
      logicalTop = this.element.scrollTop * metrics.ratio;
    this.canvas.style.height = metrics.physicalHeight + 'px';
    const begin = Math.max(0, Math.floor(logicalTop / this.height) - 4),
      end = Math.min(
        this.index.starts.length,
        Math.ceil(
          (logicalTop + (this.element.clientHeight || 400)) / this.height,
        ) + 4,
      );
    this.canvas.replaceChildren();
    for (let i = begin; i < end; i++) {
      const row = this.document.createElement('div');
      row.className = 'filumo-json-record';
      row.style.top =
        i * this.height - logicalTop + this.element.scrollTop + 'px';
      row.style.height = this.height + 'px';
      row.dataset.record = String(i);
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(i === this.selected));
      row.tabIndex = -1;
      const title = this.document.createElement('strong'),
        preview = this.document.createElement('span');
      title.textContent = this.en
        ? `Record ${i + 1} · line ${this.index.lineNumbers[i]}`
        : `记录 ${i + 1} · 第 ${this.index.lineNumbers[i]} 行`;
      if (!this.index.valid[i]) {
        row.dataset.invalid = 'true';
        title.textContent += this.en ? ' · invalid' : ' · 无法结构化';
      }
      preview.textContent = this.text
        .slice(
          this.index.starts[i],
          Math.min(this.index.ends[i], this.index.starts[i] + 80),
        )
        .trim();
      row.append(title, preview);
      row.onclick = () => {
        this.setCurrent(i);
        this.choose(i);
      };
      this.canvas.append(row);
    }
  }
  private key = (event: KeyboardEvent) => {
    if (!this.index.starts.length) return;
    let next = this.selected < 0 ? 0 : this.selected;
    if (event.key === 'ArrowDown') next++;
    else if (event.key === 'ArrowUp') next--;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = this.index.starts.length - 1;
    else if (event.key === 'PageDown')
      next += Math.max(1, Math.floor(this.element.clientHeight / this.height));
    else if (event.key === 'PageUp')
      next -= Math.max(1, Math.floor(this.element.clientHeight / this.height));
    else return;
    event.preventDefault();
    next = Math.max(0, Math.min(this.index.starts.length - 1, next));
    this.setCurrent(next);
    this.choose(next);
  };
  setCurrent(index: number, force = false): void {
    const changed = index !== this.selected;
    this.selected = index;
    if (this.active && (changed || force)) {
      const top = index * this.height;
      const metrics = this.scrollMetrics,
        logicalTop = this.element.scrollTop * metrics.ratio;
      if (top < logicalTop) this.element.scrollTop = top / metrics.ratio;
      else if (top + this.height > logicalTop + this.element.clientHeight)
        this.element.scrollTop = Math.max(
          0,
          (top + this.height - this.element.clientHeight) / metrics.ratio,
        );
    }
    this.schedule();
  }
  update(zoom: number, en: boolean): void {
    const row =
      (this.element.scrollTop * this.scrollMetrics.ratio) / this.height;
    this.height = (46 * zoom) / 100;
    this.en = en;
    const metrics = this.scrollMetrics;
    this.canvas.style.height = metrics.physicalHeight + 'px';
    this.element.scrollTop = (row * this.height) / metrics.ratio;
    this.schedule();
  }
  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (active) {
      this.resize?.observe(this.element);
      this.setCurrent(this.selected, true);
    } else {
      this.resize?.disconnect();
      if (this.frame !== undefined)
        this.document.defaultView?.cancelAnimationFrame(this.frame);
      this.frame = undefined;
    }
  }
  dispose(): void {
    if (this.closed) return;
    this.setActive(false);
    this.closed = true;
    this.element.removeEventListener('scroll', this.schedule);
    this.element.removeEventListener('keydown', this.key);
    this.element.remove();
  }
}
