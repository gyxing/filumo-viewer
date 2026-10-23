import type { CsvIndex } from '../parser/types';
import type { CsvSession } from '../runtime/CsvSession';
import { GridInteractionController, GridColumnResize } from '@filumo/dom/grid';
import type { GridPoint, GridRange, GridState } from '@filumo/dom/grid';
import type { StylePolicy } from '@filumo/dom';
import { CsvCellDetail } from './CsvCellDetail';
import { CsvFind } from './CsvFind';
import { csvScrollMetrics } from './csvViewport';
import './csv.less';
export interface CsvGridOptions {
  stylePolicy?: StylePolicy;
  locale?: 'zh-CN' | 'en-US';
  zoom: number;
}
export interface CsvGridState extends GridState {
  top: number;
  left: number;
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
  private interaction: GridInteractionController;
  private headerMatch?: number;
  private pendingColumn?: { column: number; offset: number };
  private widths = new Map<number, number>();
  private offsets: number[] = [];
  private headerNodes = new Map<number, HTMLElement>();
  private rowNodes = new Map<number, HTMLElement>();
  private cellNodes = new Map<string, HTMLElement>();
  private resize: GridColumnResize;
  private observer?: ResizeObserver;
  private frame?: number;
  private rendering = new AbortController();
  private detailRequest = new AbortController();
  private active = true;
  private closed = false;
  private pendingPosition?: { top: number; left: number };
  constructor(
    private session: CsvSession,
    private index: CsvIndex,
    private document: Document,
    private options: CsvGridOptions,
    private onError: (error: unknown) => void,
    state?: CsvGridState,
    private widthsChanged: () => void = () => undefined,
  ) {
    this.element = document.createElement('section');
    this.element.className = 'filumo-csv-grid';
    this.viewport = document.createElement('div');
    this.viewport.className = 'filumo-csv-viewport';
    this.viewport.tabIndex = 0;
    this.viewport.setAttribute('role', 'grid');
    this.header = document.createElement('div');
    this.header.className = 'filumo-csv-header';
    this.header.setAttribute('role', 'row');
    this.canvas = document.createElement('div');
    this.canvas.className = 'filumo-csv-canvas';
    this.detail = new CsvCellDetail(document);
    this.find = new CsvFind(
      document,
      session,
      index,
      (row, column) => this.revealCell(row, column),
      onError,
      options.locale === 'en-US',
      () => {
        this.headerMatch = undefined;
        this.schedule();
        if (this.active) this.viewport.focus({ preventScroll: true });
      },
    );
    this.viewport.append(this.header, this.canvas);
    this.element.append(this.find.element, this.viewport, this.detail.element);
    if (state) {
      this.widths = new Map(state.widths);
      this.pendingPosition = { top: state.top, left: state.left };
    }
    this.resize = new GridColumnResize({
      host: this.header,
      scale: () => this.scale,
      width: (column) => this.width(column) / this.scale,
      override: (column) => this.widths.get(column),
      change: (column, width) => {
        this.interaction?.clearTextSelection();
        const at = Math.max(
          0,
          this.offsets.findIndex(
            (value, index) => value > this.viewport.scrollLeft && index > 0,
          ) - 1,
        );
        this.pendingColumn = {
          column: at,
          offset: this.viewport.scrollLeft - (this.offsets[at] ?? 0),
        };
        if (width === undefined) this.widths.delete(column);
        else this.widths.set(column, width);
        this.widthsChanged();
        this.schedule();
      },
    });
    this.interaction = new GridInteractionController({
      stylePolicy: options.stylePolicy,
      locale: options.locale,
      host: this.viewport,
      state,
      onTextSelectionChange: () => this.schedule(),
      onError: this.error,
      search: () => this.showSearch(),
      adapter: {
        bounds: () => this.bounds(),
        revision: () => this.session.content.revision,
        hitTest: (x, y, clamp) => this.hitTest(x, y, clamp),
        rects: (range) => this.rects(range),
        reveal: (point) => this.scrollToCell(point.row, point.column),
        readRows: (range, signal) => this.readRows(range, signal),
        pageRows: () =>
          Math.max(
            1,
            Math.floor(
              (this.viewport.clientHeight - this.rowHeight) / this.rowHeight,
            ),
          ),
        changed: (state) => {
          if (state.focus) void this.showDetail(state.focus);
          else this.detail.element.textContent = '';
        },
      },
    });
    this.viewport.addEventListener('scroll', this.schedule, { passive: true });
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
    if (
      !this.closed &&
      this.active &&
      (error as { name?: string })?.name !== 'AbortError'
    )
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
    if (this.pendingColumn) {
      this.viewport.scrollLeft =
        (this.offsets[this.pendingColumn.column] ?? 0) +
        Math.min(
          this.width(this.pendingColumn.column) - 1,
          this.pendingColumn.offset,
        );
      this.pendingColumn = undefined;
    }
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
    const reuse = this.interaction.hasTextSelection;
    const usedRows = new Set<number>(),
      usedCells = new Set<string>(),
      usedHeaders = new Set<number>();
    if (!reuse) {
      this.header.replaceChildren();
      this.canvas.replaceChildren();
      this.headerNodes.clear();
      this.rowNodes.clear();
      this.cellNodes.clear();
    }
    const heading =
      this.session.header && this.index.rowStarts.length
        ? await this.session.getRow(0, signal)
        : [];
    if (signal.aborted || this.closed) return;
    for (let column = colStart; column < colEnd; column++) {
      usedHeaders.add(column);
      const existing = reuse ? this.headerNodes.get(column) : undefined;
      if (existing) {
        existing.style.left = this.offsets[column] + 'px';
        existing.style.width = this.width(column) + 'px';
        existing.dataset.gridFindMatch = String(this.headerMatch === column);
        continue;
      }
      const cell = this.document.createElement('div');
      cell.className = 'filumo-csv-heading';
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
      cell.dataset.gridHeaderColumn = String(column);
      cell.dataset.gridFindMatch = String(this.headerMatch === column);
      if (this.session.header) {
        cell.dataset.csvCell = '';
        cell.dataset.row = '0';
        cell.dataset.column = String(column);
      }
      const handle = this.document.createElement('span');
      handle.dataset.resizeColumn = String(column);
      handle.className = 'filumo-csv-column-resize filumo-grid-column-resize';
      handle.tabIndex = 0;
      handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-orientation', 'vertical');
      handle.setAttribute(
        'aria-label',
        this.options.locale === 'en-US' ? 'Resize column' : '调整列宽',
      );
      cell.append(handle);
      const next = reuse
        ? Array.from(this.header.children).find(
            (node) =>
              +(node.getAttribute('data-grid-header-column') ?? -1) > column,
          )
        : undefined;
      this.header.insertBefore(cell, next ?? null);
      this.headerNodes.set(column, cell);
    }
    for (let at = begin; at < end; at++) {
      const row = at + this.firstRow,
        fields = await this.session.getRow(row, signal);
      if (signal.aborted || this.closed) return;
      usedRows.add(row);
      let line = reuse ? this.rowNodes.get(row) : undefined;
      if (!line) {
        line = this.document.createElement('div');
        line.className = 'filumo-csv-row';
        line.setAttribute('role', 'row');
        line.setAttribute('aria-rowindex', String(row + 1));
        const next = reuse
          ? Array.from(this.canvas.children).find(
              (node) => +(node.getAttribute('aria-rowindex') ?? 0) > row + 1,
            )
          : undefined;
        this.canvas.insertBefore(line, next ?? null);
        this.rowNodes.set(row, line);
      }
      line.style.top =
        at * height - logicalTop + this.viewport.scrollTop + 'px';
      line.style.height = height + 'px';
      line.style.width = total + 'px';
      for (let column = colStart; column < colEnd; column++) {
        const key = row + ':' + column;
        usedCells.add(key);
        const existing = reuse ? this.cellNodes.get(key) : undefined;
        if (existing) {
          existing.style.left = this.offsets[column] + 'px';
          existing.style.width = this.width(column) + 'px';
          continue;
        }
        const cell = this.document.createElement('div');
        cell.className = 'filumo-csv-cell';
        cell.dataset.csvCell = '';
        cell.dataset.row = String(row);
        cell.dataset.gridRow = String(row);
        cell.dataset.gridColumn = String(column);
        cell.dataset.column = String(column);
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-colindex', String(column + 1));
        cell.style.left = this.offsets[column] + 'px';
        cell.style.width = this.width(column) + 'px';
        const text = this.document.createElement('span');
        text.className = 'filumo-grid-text';
        text.textContent = fields[column]
          ? await this.session.value(fields[column], 256, signal)
          : '';
        if (signal.aborted || this.closed) return;
        cell.append(text);
        const next = reuse
          ? Array.from(line.children).find(
              (node) => +(node.getAttribute('data-grid-column') ?? -1) > column,
            )
          : undefined;
        line.insertBefore(cell, next ?? null);
        this.cellNodes.set(key, cell);
      }
    }
    if (reuse) {
      for (const [key, node] of this.cellNodes)
        if (!usedCells.has(key) && !this.interaction.preservesText(node)) {
          node.remove();
          this.cellNodes.delete(key);
        }
      for (const [row, node] of this.rowNodes) {
        if (!usedRows.has(row) && !this.interaction.preservesText(node)) {
          node.remove();
          this.rowNodes.delete(row);
        } else {
          // 超长文件采用压缩滚动轨道，保留的文字节点仍需跟随逻辑行位置。
          node.style.top =
            (row - this.firstRow) * height -
            logicalTop +
            this.viewport.scrollTop +
            'px';
        }
      }
      for (const [column, node] of this.headerNodes)
        if (!usedHeaders.has(column) && !this.interaction.preservesText(node)) {
          node.remove();
          this.headerNodes.delete(column);
        }
    }
    this.interaction.refresh();
    this.resize.refresh();
  }
  private bounds(): GridRange | undefined {
    const endRow = this.index.rowStarts.length - 1,
      endColumn = this.index.columnCount - 1;
    return endRow >= this.firstRow && endColumn >= 0
      ? { startRow: this.firstRow, endRow, startColumn: 0, endColumn }
      : undefined;
  }
  private hitTest(x: number, y: number, clamp: boolean): GridPoint | undefined {
    const bounds = this.bounds(),
      rect = this.viewport.getBoundingClientRect();
    if (!bounds || this.offsets.length < 2) return undefined;
    let left = x - rect.left,
      top = y - rect.top - this.rowHeight;
    const height = this.viewport.clientHeight - this.rowHeight;
    if (
      !clamp &&
      (left < 0 ||
        top < 0 ||
        left >= this.viewport.clientWidth ||
        top >= height)
    )
      return undefined;
    left = Math.max(0, Math.min(this.viewport.clientWidth - 1, left));
    top = Math.max(0, Math.min(Math.max(0, height - 1), top));
    const metrics = csvScrollMetrics(
      bounds.endRow - this.firstRow + 1,
      this.rowHeight,
      this.viewport.clientHeight,
    );
    const row =
      this.firstRow +
      Math.floor(
        (this.viewport.scrollTop * metrics.ratio + top) / this.rowHeight,
      );
    const offset = left + this.viewport.scrollLeft;
    let low = 0,
      high = this.index.columnCount;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.offsets[mid + 1] <= offset) low = mid + 1;
      else high = mid;
    }
    if (!clamp && (row > bounds.endRow || low > bounds.endColumn))
      return undefined;
    return {
      row: Math.min(bounds.endRow, row),
      column: Math.min(bounds.endColumn, low),
    };
  }
  private rects(range: GridRange) {
    const metrics = csvScrollMetrics(
      Math.max(0, this.index.rowStarts.length - this.firstRow),
      this.rowHeight,
      this.viewport.clientHeight,
    );
    const left =
      (this.offsets[range.startColumn] ?? 0) - this.viewport.scrollLeft;
    const right =
      (this.offsets[range.endColumn + 1] ?? 0) - this.viewport.scrollLeft;
    const top =
      this.rowHeight +
      (range.startRow - this.firstRow) * this.rowHeight -
      this.viewport.scrollTop * metrics.ratio;
    const bottom = top + (range.endRow - range.startRow + 1) * this.rowHeight;
    const x = Math.max(0, left),
      y = Math.max(this.rowHeight, top);
    return [
      {
        left: x,
        top: y,
        width: Math.max(0, Math.min(this.viewport.clientWidth, right) - x),
        height: Math.max(0, Math.min(this.viewport.clientHeight, bottom) - y),
      },
    ];
  }
  private async *readRows(range: GridRange, signal: AbortSignal) {
    for (let row = range.startRow; row <= range.endRow; row++) {
      const cells = await this.session.getRow(row, signal),
        values: string[] = [];
      for (let column = range.startColumn; column <= range.endColumn; column++)
        values.push(
          cells[column]
            ? await this.session.value(cells[column], undefined, signal)
            : '',
        );
      yield values;
    }
  }
  /** 复制入口与快捷键共用预算、完整字段和取消语义。 */
  copy(): Promise<void> {
    return this.interaction.copy();
  }
  /** 只恢复预览列宽，不修改原文或重新解析。 */
  get hasColumnWidths(): boolean {
    return this.widths.size > 0;
  }
  resetColumnWidths(): void {
    this.resize.setActive(false);
    this.widths.clear();
    this.resize.setActive(this.active);
    this.widthsChanged();
    this.schedule();
  }
  private async showDetail(point: GridPoint) {
    this.detailRequest.abort();
    const own = (this.detailRequest = new AbortController()),
      { row, column } = point;
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
  /** 字符偏移查找结果可由调用方映射为真实逻辑行和列。 */
  revealCell(row: number, column: number, extend = false): void {
    if (row < this.firstRow) {
      this.headerMatch = column;
      this.scrollToCell(this.firstRow, column);
      this.schedule();
      return;
    }
    this.headerMatch = undefined;
    this.interaction.select({ row, column }, extend);
  }
  private scrollToCell(row: number, column: number): void {
    if (!this.index.rowStarts.length || !this.index.columnCount) return;
    const point = {
      row: Math.max(0, Math.min(this.index.rowStarts.length - 1, row)),
      column: Math.max(0, Math.min(this.index.columnCount - 1, column)),
    };
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
    this.schedule();
  }
  showSearch(): void {
    this.find.show(true);
  }
  update(options: CsvGridOptions): void {
    this.interaction.clearTextSelection();
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
    this.interaction.updateLocale(options.locale);
    for (const column of this.widths.keys())
      if (column >= this.index.columnCount) this.widths.delete(column);
    this.interaction.refresh();
    this.rendering.abort();
    this.schedule();
  }
  getState(): CsvGridState {
    return {
      top: this.viewport.scrollTop,
      left: this.viewport.scrollLeft,
      ...this.interaction.getState(),
      widths: [...this.widths],
    };
  }
  setActive(active: boolean): void {
    this.active = active;
    this.resize.setActive(active);
    this.interaction.setActive(active);
    this.find.setActive(active);
    if (!active) {
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
    this.resize.dispose();
    this.interaction.dispose();
    this.headerNodes.clear();
    this.rowNodes.clear();
    this.cellNodes.clear();
    this.find.dispose();
    this.viewport.removeEventListener('scroll', this.schedule);
    this.element.remove();
  }
}
