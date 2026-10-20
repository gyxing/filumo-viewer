import type { CsvIndex } from '../parser/types';
import type { CsvSession } from '../runtime/CsvSession';
import { CsvSelection } from './CsvSelection';
import { CsvColumnResize } from './CsvColumnResize';
import { CsvCellDetail } from './CsvCellDetail';
import { CsvFind } from './CsvFind';
import { csvScrollMetrics } from './csvViewport';
import './csv.less';
export interface CsvGridOptions {
  locale?: 'zh-CN' | 'en-US';
  zoom: number;
}
export interface CsvGridState {
  top: number;
  left: number;
  anchor: { row: number; column: number };
  focus: { row: number; column: number };
  widths: [number, number][];
}

/** 横纵双窗口只建立可见网格，异步预览和选择状态分别管理。 */
export class CsvGrid {
  readonly element: HTMLElement;
  private viewport: HTMLElement;
  private header: HTMLElement;
  private canvas: HTMLElement;
  private detail: CsvCellDetail;
  private find: CsvFind;
  private selection = new CsvSelection();
  private widths = new Map<number, number>();
  private offsets: number[] = [];
  private resize: CsvColumnResize;
  private observer?: ResizeObserver;
  private frame?: number;
  private rendering = new AbortController();
  private detailRequest = new AbortController();
  private copying = new AbortController();
  private active = true;
  private closed = false;
  private pointer?: number;
  private pendingPosition?: { top: number; left: number };
  constructor(
    private session: CsvSession,
    private index: CsvIndex,
    private document: Document,
    private options: CsvGridOptions,
    private onError: (error: unknown) => void,
    state?: CsvGridState,
  ) {
    this.element = document.createElement('section');
    this.element.className = 'fivo-csv-grid';
    this.viewport = document.createElement('div');
    this.viewport.className = 'fivo-csv-viewport';
    this.viewport.tabIndex = 0;
    this.viewport.setAttribute('role', 'grid');
    this.header = document.createElement('div');
    this.header.className = 'fivo-csv-header';
    this.header.setAttribute('role', 'row');
    this.canvas = document.createElement('div');
    this.canvas.className = 'fivo-csv-canvas';
    this.detail = new CsvCellDetail(document);
    this.find = new CsvFind(
      document,
      session,
      index,
      (row, column) => this.revealCell(row, column),
      onError,
      options.locale === 'en-US',
    );
    this.viewport.append(this.header, this.canvas);
    this.element.append(this.find.element, this.viewport, this.detail.element);
    this.selection.select(
      {
        row: Math.min(
          this.firstRow,
          Math.max(0, this.index.rowStarts.length - 1),
        ),
        column: 0,
      },
      false,
    );
    if (state) {
      this.widths = new Map(state.widths);
      this.selection.anchor = state.anchor;
      this.selection.focus = state.focus;
      this.pendingPosition = { top: state.top, left: state.left };
    }
    this.resize = new CsvColumnResize(
      this.header,
      (column) => this.width(column),
      (column, width) => {
        this.widths.set(
          column,
          Math.max(64, Math.min(800, width / this.scale)),
        );
        this.schedule();
      },
    );
    this.viewport.addEventListener('scroll', this.schedule, { passive: true });
    this.viewport.addEventListener('pointerdown', this.down);
    this.viewport.addEventListener('pointermove', this.move);
    this.viewport.addEventListener('pointerup', this.end);
    this.viewport.addEventListener('pointercancel', this.end);
    this.viewport.addEventListener('lostpointercapture', this.end);
    this.viewport.addEventListener('keydown', this.key);
    const Resize = document.defaultView?.ResizeObserver;
    if (Resize) {
      this.observer = new Resize(this.schedule);
      this.observer.observe(this.viewport);
    }
    this.update(options);
  }
  private get firstRow() {
    return this.session.header && this.index.rowStarts.length ? 1 : 0;
  }
  private get scale() {
    return this.options.zoom / 100;
  }
  private get rowHeight() {
    return 28 * this.scale;
  }
  private width(column: number) {
    return (this.widths.get(column) ?? 160) * this.scale;
  }
  private schedule = () => {
    if (this.closed || !this.active || this.frame !== undefined) return;
    const window = this.document.defaultView;
    if (window)
      this.frame = window.requestAnimationFrame(() => {
        this.frame = undefined;
        void this.render().catch(this.error);
      });
    else void this.render().catch(this.error);
  };
  private error = (error: unknown) => {
    if (!this.closed && (error as { name?: string })?.name !== 'AbortError')
      this.onError(error);
  };
  private async render() {
    if (this.closed || !this.active) return;
    this.rendering.abort();
    const own = (this.rendering = new AbortController()),
      signal = own.signal;
    const count = this.index.columnCount,
      height = this.rowHeight,
      rows = Math.max(0, this.index.rowStarts.length - this.firstRow);
    this.offsets = [0];
    for (let col = 0; col < count; col++)
      this.offsets.push(this.offsets[col] + this.width(col));
    const total = this.offsets[count];
    this.canvas.style.width = total + 'px';
    const scroll = csvScrollMetrics(
      rows,
      height,
      this.viewport.clientHeight || 400,
    );
    this.canvas.style.height = scroll.physicalHeight + 'px';
    if (this.pendingPosition) {
      this.viewport.scrollTop = this.pendingPosition.top;
      this.viewport.scrollLeft = this.pendingPosition.left;
      this.pendingPosition = undefined;
    }
    const left = this.viewport.scrollLeft,
      right = left + Math.max(1, this.viewport.clientWidth);
    let colStart = 0,
      colEnd = count;
    while (colStart < count && this.offsets[colStart + 1] < left) colStart++;
    colStart = Math.max(0, colStart - 1);
    colEnd = colStart;
    while (colEnd < count && this.offsets[colEnd] <= right) colEnd++;
    colEnd = Math.min(count, colEnd + 1);
    const logicalTop = this.viewport.scrollTop * scroll.ratio;
    const begin = Math.max(0, Math.floor(logicalTop / height) - 3),
      end = Math.min(
        rows,
        Math.ceil((logicalTop + (this.viewport.clientHeight || 400)) / height) +
          3,
      );
    this.viewport.setAttribute('aria-rowcount', String(rows));
    this.viewport.setAttribute('aria-colcount', String(count));
    this.element.style.fontSize = 14 * this.scale + 'px';
    this.header.style.width = total + 'px';
    this.header.style.height = height + 'px';
    this.canvas.style.width = total + 'px';
    this.canvas.style.height = scroll.physicalHeight + 'px';
    this.header.replaceChildren();
    this.canvas.replaceChildren();
    const heading =
      this.session.header && this.index.rowStarts.length
        ? await this.session.getRow(0, signal)
        : [];
    if (signal.aborted || this.closed) return;
    for (let column = colStart; column < colEnd; column++) {
      const cell = this.document.createElement('div');
      cell.className = 'fivo-csv-heading';
      cell.setAttribute('role', 'columnheader');
      cell.style.left = this.offsets[column] + 'px';
      cell.style.width = this.width(column) + 'px';
      const value = heading[column]
        ? await this.session.value(heading[column], 256, signal)
        : '';
      if (signal.aborted || this.closed) return;
      cell.textContent =
        value ||
        (this.options.locale === 'en-US' ? 'Column ' : '列 ') + (column + 1);
      cell.title = value;
      if (this.session.header) {
        cell.dataset.csvCell = '';
        cell.dataset.row = '0';
        cell.dataset.column = String(column);
      }
      const handle = this.document.createElement('span');
      handle.dataset.resizeColumn = String(column);
      handle.className = 'fivo-csv-column-resize';
      handle.tabIndex = 0;
      handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-orientation', 'vertical');
      handle.setAttribute(
        'aria-label',
        this.options.locale === 'en-US' ? 'Resize column' : '调整列宽',
      );
      cell.append(handle);
      this.header.append(cell);
    }
    for (let at = begin; at < end; at++) {
      const row = at + this.firstRow,
        fields = await this.session.getRow(row, signal);
      if (signal.aborted || this.closed) return;
      const line = this.document.createElement('div');
      line.className = 'fivo-csv-row';
      line.setAttribute('role', 'row');
      line.style.top =
        at * height - logicalTop + this.viewport.scrollTop + 'px';
      line.style.height = height + 'px';
      line.style.width = total + 'px';
      this.canvas.append(line);
      for (let column = colStart; column < colEnd; column++) {
        const cell = this.document.createElement('div');
        cell.className = 'fivo-csv-cell';
        cell.dataset.csvCell = '';
        cell.dataset.row = String(row);
        cell.dataset.column = String(column);
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-colindex', String(column + 1));
        cell.style.left = this.offsets[column] + 'px';
        cell.style.width = this.width(column) + 'px';
        cell.textContent = fields[column]
          ? await this.session.value(fields[column], 256, signal)
          : '';
        if (signal.aborted || this.closed) return;
        line.append(cell);
      }
    }
    this.paintSelection();
  }
  private point(event: PointerEvent) {
    const target =
      this.pointer === undefined
        ? (event.target as Element)
        : this.document.elementFromPoint(event.clientX, event.clientY);
    const cell = target?.closest<HTMLElement>('[data-csv-cell]');
    return cell && this.viewport.contains(cell)
      ? { row: Number(cell.dataset.row), column: Number(cell.dataset.column) }
      : undefined;
  }
  private down = (event: PointerEvent) => {
    if (!this.active || this.closed) return;
    const point = this.point(event);
    if (!point || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    this.viewport.focus({ preventScroll: true });
    this.pointer = event.pointerId;
    this.viewport.setPointerCapture(event.pointerId);
    this.selection.select(point, event.shiftKey);
    this.paintSelection();
    void this.showDetail();
  };
  private move = (event: PointerEvent) => {
    if (event.pointerId !== this.pointer) return;
    const point = this.point(event);
    if (point) {
      this.selection.select(point, true);
      this.paintSelection();
    }
  };
  private end = (event: PointerEvent) => {
    if (event.pointerId !== this.pointer) return;
    this.pointer = undefined;
    if (this.viewport.hasPointerCapture(event.pointerId))
      this.viewport.releasePointerCapture(event.pointerId);
    if (!this.closed && this.active) void this.showDetail();
  };
  private paintSelection() {
    for (const cell of this.viewport.querySelectorAll<HTMLElement>(
      '[data-csv-cell]',
    ))
      cell.setAttribute(
        'aria-selected',
        String(
          this.selection.contains(
            Number(cell.dataset.row),
            Number(cell.dataset.column),
          ),
        ),
      );
  }
  private async showDetail() {
    this.detailRequest.abort();
    const own = (this.detailRequest = new AbortController()),
      { row, column } = this.selection.focus;
    try {
      const fields = await this.session.getRow(row, own.signal),
        cell = fields[column],
        max = this.session.options.maxCellDetailChars ?? 65536;
      const value = cell
        ? await this.session.value(cell, max + 1, own.signal)
        : '';
      if (!own.signal.aborted && !this.closed)
        this.detail.update(
          row,
          column,
          value.slice(0, max),
          value.length > max,
          this.options.locale === 'en-US',
        );
    } catch (error) {
      this.error(error);
    }
  }
  private key = (event: KeyboardEvent) => {
    if (!this.active || this.closed) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      this.showSearch();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      void this.copy().catch(this.error);
      return;
    }
    const point = { ...this.selection.focus },
      steps = Math.max(
        1,
        Math.floor(this.viewport.clientHeight / this.rowHeight),
      );
    if (event.key === 'ArrowDown') point.row++;
    else if (event.key === 'ArrowUp') point.row--;
    else if (event.key === 'ArrowLeft') point.column--;
    else if (event.key === 'ArrowRight') point.column++;
    else if (event.key === 'Home') point.column = 0;
    else if (event.key === 'End') point.column = this.index.columnCount - 1;
    else if (event.key === 'PageDown') point.row += steps;
    else if (event.key === 'PageUp') point.row -= steps;
    else return;
    event.preventDefault();
    this.revealCell(point.row, point.column, event.shiftKey);
  };
  /** 复制读取完整字段，选区转为带引号保护的 TSV。 */
  async copy(): Promise<void> {
    if (!this.active || this.closed) return;
    const clipboard = this.document.defaultView?.navigator.clipboard;
    if (!clipboard) throw new Error('当前环境无法复制');
    this.copying.abort();
    this.copying = new AbortController();
    const signal = this.copying.signal,
      a = { ...this.selection.anchor },
      b = { ...this.selection.focus },
      lines: string[] = [];
    const single = a.row === b.row && a.column === b.column;
    for (
      let row = Math.min(a.row, b.row);
      row <= Math.max(a.row, b.row);
      row++
    ) {
      const cells = await this.session.getRow(row, signal),
        fields: string[] = [];
      for (
        let column = Math.min(a.column, b.column);
        column <= Math.max(a.column, b.column);
        column++
      ) {
        const text = cells[column]
          ? await this.session.value(cells[column], undefined, signal)
          : '';
        fields.push(
          !single && /[\t\r\n"]/.test(text)
            ? '"' + text.replace(/"/g, '""') + '"'
            : text,
        );
      }
      lines.push(fields.join('\t'));
    }
    if (!signal.aborted && !this.closed && this.active)
      await clipboard.writeText(lines.join('\n'));
  }
  /** 字符偏移查找结果可由调用方映射为真实逻辑行和列。 */
  revealCell(row: number, column: number, extend = false): void {
    if (!this.index.rowStarts.length || !this.index.columnCount) return;
    const point = {
      row: Math.max(0, Math.min(this.index.rowStarts.length - 1, row)),
      column: Math.max(0, Math.min(this.index.columnCount - 1, column)),
    };
    this.selection.select(point, extend);
    const top = Math.max(0, point.row - this.firstRow) * this.rowHeight;
    const metrics = csvScrollMetrics(
      Math.max(0, this.index.rowStarts.length - this.firstRow),
      this.rowHeight,
      this.viewport.clientHeight || 400,
    );
    const logicalTop = this.viewport.scrollTop * metrics.ratio;
    if (
      top < logicalTop ||
      top + this.rowHeight >
        logicalTop + this.viewport.clientHeight - this.rowHeight
    )
      this.viewport.scrollTop = top / metrics.ratio;
    const left =
      this.offsets[point.column] ?? point.column * this.width(point.column);
    if (
      left < this.viewport.scrollLeft ||
      left + this.width(point.column) >
        this.viewport.scrollLeft + this.viewport.clientWidth
    )
      this.viewport.scrollLeft = left;
    this.paintSelection();
    this.schedule();
    void this.showDetail();
  }
  showSearch(): void {
    this.find.show(true);
  }
  update(options: CsvGridOptions): void {
    this.find.updateLocale(options.locale === 'en-US');
    if (options.zoom !== this.options.zoom) {
      const rows = Math.max(0, this.index.rowStarts.length - this.firstRow),
        viewport = this.viewport.clientHeight || 400;
      const row =
        (this.viewport.scrollTop *
          csvScrollMetrics(rows, this.rowHeight, viewport).ratio) /
        this.rowHeight;
      const height = (28 * options.zoom) / 100;
      this.pendingPosition = {
        top: (row * height) / csvScrollMetrics(rows, height, viewport).ratio,
        left: (this.viewport.scrollLeft * options.zoom) / this.options.zoom,
      };
    }
    this.options = options;
    this.rendering.abort();
    this.schedule();
  }
  getState(): CsvGridState {
    return {
      top: this.viewport.scrollTop,
      left: this.viewport.scrollLeft,
      anchor: { ...this.selection.anchor },
      focus: { ...this.selection.focus },
      widths: [...this.widths],
    };
  }
  setActive(active: boolean): void {
    this.active = active;
    this.resize.setActive(active);
    this.find.setActive(active);
    if (!active) {
      if (this.pointer !== undefined)
        this.end({ pointerId: this.pointer } as PointerEvent);
      this.copying.abort();
      this.rendering.abort();
      this.detailRequest.abort();
      this.observer?.disconnect();
      if (this.frame !== undefined)
        this.document.defaultView?.cancelAnimationFrame(this.frame);
      this.frame = undefined;
    } else {
      this.observer?.observe(this.viewport);
      this.schedule();
    }
  }
  dispose(): void {
    if (this.closed) return;
    this.setActive(false);
    this.closed = true;
    if (this.pointer !== undefined)
      this.end({ pointerId: this.pointer } as PointerEvent);
    this.resize.dispose();
    this.find.dispose();
    this.viewport.removeEventListener('scroll', this.schedule);
    this.viewport.removeEventListener('pointerdown', this.down);
    this.viewport.removeEventListener('pointermove', this.move);
    this.viewport.removeEventListener('pointerup', this.end);
    this.viewport.removeEventListener('pointercancel', this.end);
    this.viewport.removeEventListener('lostpointercapture', this.end);
    this.viewport.removeEventListener('keydown', this.key);
    this.element.remove();
  }
}
