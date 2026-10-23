import { renderSpreadsheetGridHeaders } from './SpreadsheetGridHeaders';
import {
  spreadsheetGridPaneClips,
  spreadsheetGridMetrics,
  type SpreadsheetGridMetrics,
} from './SpreadsheetGridGeometry';
import {
  SpreadsheetGridInteraction,
  type SpreadsheetGridState,
} from './SpreadsheetGridInteraction';
import {
  createSpreadsheetAxisIndex,
  type SpreadsheetAxisIndex,
} from '../../engine/spreadsheet/SpreadsheetAxisIndex';
import type {
  SpreadsheetSheetLayout,
  SpreadsheetSource,
} from '../../engine/spreadsheet/SpreadsheetSource';
import type {
  SpreadsheetCell,
  SpreadsheetMerge,
  SpreadsheetRange,
  SpreadsheetRangeData,
} from '../../engine/spreadsheet/types';
import { applyDomStyle, createDom } from '../../view/dom/createDom';
import { mountChart } from '../../view/shared/mountChart';
import type { OfficeRenderContext } from '../../view/types';
import { OfficeElementContext } from '../common/OfficeElementContext';
import { createCellView } from './elements/CellView';
import { createSpreadsheetGridDom } from './SpreadsheetGridDom';
import {
  createSpreadsheetGridKey,
  normalizeSpreadsheetGridScale,
  resolveSpreadsheetFrozenCounts,
} from './SpreadsheetGridModel';
import { readSpreadsheetViewportPadding } from './SpreadsheetGridViewport';
import {
  XLSX_COLUMN_HEADER_HEIGHT as HEADER,
  XLSX_ROW_HEADER_WIDTH as ROW_HEADER,
  buildXlsxCellStyle,
  getSpreadsheetColumnLabel,
  isHighlightedXlsxCell,
} from './sheetStyles';
import {
  buildSpreadsheetRowContentBounds,
  isSpreadsheetCellOccupied,
  type SpreadsheetCellContentBounds,
} from './support/spreadsheetCellOverflow';
import {
  buildSpreadsheetReadingRowHeightUpdates,
  isSpreadsheetShrinkToFitCell,
  mergeSpreadsheetReadingRowMetrics,
  remapSpreadsheetVerticalRange,
} from './support/spreadsheetReadingLayout';
interface Region {
  kind: 'body' | 'rows' | 'columns' | 'corner';
  range: SpreadsheetRange;
  data?: SpreadsheetRangeData;
  release?: () => void;
}
/** 复用稀疏轴、阅读行高、合并和溢出规则，在二维窗口内渲染普通及冻结单元格。 */
export class SpreadsheetGrid {
  readonly element: HTMLDivElement;
  private canvas: HTMLDivElement;
  private cells: HTMLDivElement;
  private panes: Record<'rows' | 'columns' | 'corner', HTMLDivElement>;
  private canvasSize = { width: 0, height: 0 };
  private objects: HTMLDivElement;
  private headers: HTMLDivElement;
  private status: HTMLDivElement;
  private context: OfficeElementContext;
  private cellView;
  private rowAxis: SpreadsheetAxisIndex;
  private sourceRowAxis: SpreadsheetAxisIndex;
  private sourceColumnAxis: SpreadsheetAxisIndex;
  private columnWidths = new Map<number, number>();
  private resizingColumns = false;
  private resizeChanged = false;
  private paintedRegions?: Region[];
  private rowNodes = new Map<string, HTMLElement>();
  private cellNodes = new Map<
    string,
    {
      node: HTMLElement;
      contentKey: string;
      geometry: {
        left: number;
        top: number;
        width: number;
        height: number;
        minHeight: number;
      };
    }
  >();
  private usedRows = new Set<string>();
  private usedCells = new Set<string>();
  private gridInteraction: SpreadsheetGridInteraction;
  private columnAxis: SpreadsheetAxisIndex;
  private regions: Region[] = [];
  private displayRows = 1;
  private displayColumns = 1;
  private viewportSize = { width: 0, height: 0 };
  private request?: AbortController;
  private generation = 0;
  private signature = '';
  private closed = false;
  private active = true;
  private cancel?: () => void;
  private resize?: ResizeObserver;
  private key: string;
  private images = new Map<string, HTMLElement>();
  private charts = new Map<
    string,
    {
      node: HTMLElement;
      view: ReturnType<typeof mountChart>;
      model: unknown;
      width: number;
      height: number;
    }
  >();
  constructor(
    private readonly source: SpreadsheetSource,
    readonly sheetId: string,
    private layout: SpreadsheetSheetLayout,
    private readonly base: OfficeRenderContext,
    private zoom: number,
    private mode: 'source' | 'reading',
    private readonly reading: Map<number, number>,
    state?: SpreadsheetGridState,
  ) {
    const doc = base.document;
    const dom = createSpreadsheetGridDom(doc);
    this.element = dom.element;
    this.canvas = dom.canvas;
    this.cells = dom.cells;
    this.panes = dom.panes;
    this.objects = dom.objects;
    this.headers = dom.headers;
    this.status = dom.status;
    this.key = createSpreadsheetGridKey(sheetId);
    this.element.dataset.officeSpreadsheetSheetId = sheetId;
    this.element.dataset.officeFitViewport = 'true';
    this.element.dataset.officeOverflowViewport = 'true';
    this.sourceRowAxis = createSpreadsheetAxisIndex(
      layout.rowCount,
      layout.defaultRowHeight,
      layout.rows,
    );
    this.rowAxis = this.sourceRowAxis;
    this.columnAxis = createSpreadsheetAxisIndex(
      layout.columnCount,
      layout.defaultColumnWidth,
      layout.columns,
    );
    this.sourceColumnAxis = this.columnAxis;
    this.columnWidths = new Map(
      (state?.widths ?? []).filter(
        ([column, width]) =>
          column >= 1 &&
          column <= layout.columnCount &&
          Number.isFinite(width) &&
          width > 0,
      ),
    );
    this.context = new OfficeElementContext(base, () => this.schedule());
    this.cellView = createCellView(this.context);
    this.updateAxes();
    this.gridInteraction = new SpreadsheetGridInteraction(
      {
        source,
        sheetId,
        context: base,
        geometry: () => ({
          host: this.element,
          layout: this.layout,
          rows: this.rowAxis,
          columns: this.columnAxis,
          scale: this.scale(),
        }),
        schedule: () => this.schedule(),
        resizeStart: () => {
          this.resizingColumns = true;
          this.resizeChanged = false;
        },
        resizeEnd: () => this.finishColumnResize(),
        width: (column) => this.columnWidths.get(column),
        widths: () => [...this.columnWidths],
        clearWidths: () => this.changeColumnWidth(undefined, undefined),
        changeWidth: (column, width) => this.changeColumnWidth(column, width),
      },
      state,
    );
    if (state?.scroll) {
      this.element.scrollTop =
        (this.rowAxis.offsetAt(state.scroll.row + 1) + state.scroll.rowOffset) *
        this.scale();
      this.element.scrollLeft =
        (this.columnAxis.offsetAt(state.scroll.column + 1) +
          state.scroll.columnOffset) *
        this.scale();
    }
    this.element.addEventListener('scroll', this.schedule, { passive: true });
    const Resize = doc.defaultView?.ResizeObserver;
    if (Resize) {
      this.resize = new Resize(this.schedule);
      this.resize.observe(this.element);
    }
    this.schedule();
  }
  private scale() {
    return normalizeSpreadsheetGridScale(this.zoom);
  }
  private updateAxes(columnsOnly = false) {
    const columns = new Map(
      this.layout.columns.map((column) => [column.index, column]),
    );
    for (const [index, width] of this.columnWidths)
      if (index <= this.layout.columnCount)
        columns.set(index, {
          ...columns.get(index),
          index,
          width,
          hidden: columns.get(index)?.hidden ?? false,
        });
    const previewColumns = [...columns.values()];
    if (!columnsOnly)
      this.sourceColumnAxis = createSpreadsheetAxisIndex(
        this.layout.columnCount,
        this.layout.defaultColumnWidth || 64,
        this.layout.columns,
      );
    const old = this.rowAxis,
      scale = this.scale(),
      top = this.element.scrollTop / scale;
    const anchor = old.findIndexAtOffset(top),
      offset = top - old.offsetAt(anchor);
    if (!columnsOnly)
      this.sourceRowAxis = createSpreadsheetAxisIndex(
        this.layout.rowCount,
        this.layout.defaultRowHeight,
        this.layout.rows,
      );
    const rowMetrics =
      columnsOnly || this.mode === 'source'
        ? this.layout.rows
        : mergeSpreadsheetReadingRowMetrics(this.layout.rows, this.reading);
    const rowSize = this.layout.defaultRowHeight || 20;
    const columnSize = this.layout.defaultColumnWidth || 64;
    const dataRows = columnsOnly
      ? this.rowAxis
      : createSpreadsheetAxisIndex(this.layout.rowCount, rowSize, rowMetrics);
    const dataColumns = createSpreadsheetAxisIndex(
      this.layout.columnCount,
      columnSize,
      previewColumns,
    );
    const dataHeight = dataRows.rangeSize(1, this.layout.rowCount);
    const dataWidth = dataColumns.rangeSize(1, this.layout.columnCount);
    // 只补足当前视口的空白行列；源布局与适应宽度仍以真实数据范围为准。
    this.displayRows = Math.max(
      1,
      this.layout.rowCount +
        Math.ceil(
          Math.max(0, this.viewportSize.height - HEADER - dataHeight) / rowSize,
        ),
    );
    this.displayColumns = Math.max(
      1,
      this.layout.columnCount +
        Math.ceil(
          Math.max(0, this.viewportSize.width - ROW_HEADER - dataWidth) /
            columnSize,
        ),
    );
    if (!columnsOnly)
      this.rowAxis = createSpreadsheetAxisIndex(
        this.displayRows,
        rowSize,
        rowMetrics,
      );
    this.columnAxis = createSpreadsheetAxisIndex(
      this.displayColumns,
      columnSize,
      previewColumns,
    );
    // 补齐区末行末列只占视口剩余空间，不能由空白网格制造额外滚动条。
    if (!columnsOnly && this.displayRows > this.layout.rowCount) {
      this.rowAxis = createSpreadsheetAxisIndex(this.displayRows, rowSize, [
        ...rowMetrics.filter((row) => row.index !== this.displayRows),
        {
          index: this.displayRows,
          hidden: false,
          height: Math.max(
            0,
            this.viewportSize.height -
              HEADER -
              this.rowAxis.offsetAt(this.displayRows),
          ),
        },
      ]);
    }
    if (this.displayColumns > this.layout.columnCount) {
      this.columnAxis = createSpreadsheetAxisIndex(
        this.displayColumns,
        columnSize,
        [
          ...previewColumns.filter(
            (column) => column.index !== this.displayColumns,
          ),
          {
            index: this.displayColumns,
            hidden: false,
            width: Math.max(
              0,
              this.viewportSize.width -
                ROW_HEADER -
                this.columnAxis.offsetAt(this.displayColumns),
            ),
          },
        ],
      );
    }
    if (!columnsOnly && top > 0)
      this.element.scrollTop =
        (this.rowAxis.offsetAt(anchor) +
          Math.min(Math.max(0, offset), this.rowAxis.sizeAt(anchor))) *
        scale;
    const width =
        ROW_HEADER + this.columnAxis.rangeSize(1, this.displayColumns),
      height = HEADER + this.rowAxis.rangeSize(1, this.displayRows);
    this.canvasSize = { width, height };
    applyDomStyle(this.canvas, {
      width,
      minWidth: width,
      height,
      minHeight: height,
      zoom: scale,
    });
    this.canvas.dataset.officeFitBaseWidth = String(ROW_HEADER + dataWidth);
    this.canvas.dataset.officeFitBaseHeight = String(HEADER + dataHeight);
  }
  private schedule = () => {
    if (this.closed || !this.active) return;
    this.cancel = this.base.services.layout.schedule(
      this.key,
      () => {
        const style = this.base.document.defaultView?.getComputedStyle(
          this.element,
        );
        const padding = readSpreadsheetViewportPadding(style);
        return {
          left: this.element.scrollLeft / this.scale(),
          top: this.element.scrollTop / this.scale(),
          width: Math.max(
            1,
            (this.element.clientWidth - padding.horizontal) / this.scale(),
          ),
          height: Math.max(
            1,
            (this.element.clientHeight - padding.vertical) / this.scale(),
          ),
        };
      },
      (view) => {
        if (
          view.width !== this.viewportSize.width ||
          view.height !== this.viewportSize.height
        ) {
          this.viewportSize = { width: view.width, height: view.height };
          this.updateAxes();
        }
        this.setScrollLeft(this.element.scrollLeft);
        view.left = this.element.scrollLeft / this.scale();
        this.updateWindow(view);
        this.paint();
      },
    );
  };
  private updateWindow(view: {
    left: number;
    top: number;
    width: number;
    height: number;
  }) {
    const l = Math.max(0, view.left - ROW_HEADER),
      t = Math.max(0, view.top - HEADER);
    const profile = this.source.getProfile(this.sheetId);
    const body: SpreadsheetRange = {
      startRow: Math.max(
        1,
        this.rowAxis.findIndexAtOffset(Math.max(0, t - view.height * 2)),
      ),
      endRow: Math.min(
        this.displayRows,
        this.rowAxis.findIndexAtOffset(t + view.height * 3),
      ),
      startColumn:
        profile.gridMode === 'row-window'
          ? 1
          : Math.max(
              1,
              this.columnAxis.findIndexAtOffset(
                Math.max(0, l - view.width * 2),
              ),
            ),
      endColumn:
        profile.gridMode === 'row-window'
          ? this.displayColumns
          : Math.min(
              this.displayColumns,
              this.columnAxis.findIndexAtOffset(l + view.width * 3),
            ),
    };
    const regions: Region[] = [{ kind: 'body', range: body }];
    const pane = this.layout.pane;
    if (pane && pane.state !== 'split') {
      const { frozenRows: rows, frozenColumns: columns } =
        resolveSpreadsheetFrozenCounts(
          this.layout,
          { rows: this.rowAxis, columns: this.columnAxis },
          view,
        );
      if (rows > 0)
        regions.push({
          kind: 'rows',
          range: { ...body, startRow: 1, endRow: rows },
        });
      if (columns > 0)
        regions.push({
          kind: 'columns',
          range: { ...body, startColumn: 1, endColumn: columns },
        });
      if (rows > 0 && columns > 0)
        regions.push({
          kind: 'corner',
          range: {
            startRow: 1,
            endRow: rows,
            startColumn: 1,
            endColumn: columns,
          },
        });
    }
    const signature = JSON.stringify(
      regions.map((region) => [region.kind, region.range]),
    );
    if (signature === this.signature) return;
    // 视图列宽不会使源数据失效，已有窗口覆盖目标范围时直接复用。
    const cached =
      this.signature &&
      regions.map((region) => {
        const previous = this.regions.find((item) => item.kind === region.kind);
        const range = previous?.data?.range;
        const required = {
          ...region.range,
          endRow: Math.min(region.range.endRow, this.layout.rowCount),
          endColumn: Math.min(region.range.endColumn, this.layout.columnCount),
        };
        const empty =
          required.startRow > required.endRow ||
          required.startColumn > required.endColumn;
        return range &&
          previous?.data &&
          (empty ||
            (range.startRow <= required.startRow &&
              range.endRow >= required.endRow &&
              range.startColumn <= required.startColumn &&
              range.endColumn >= required.endColumn))
          ? { ...region, data: previous.data, release: previous.release }
          : undefined;
      });
    if (
      cached &&
      cached.every((region) => region !== undefined) &&
      cached.length === this.regions.length
    ) {
      this.request?.abort();
      this.generation++;
      this.signature = signature;
      this.regions = cached as Region[];
      return;
    }
    this.signature = signature;
    this.request?.abort();
    const controller = new AbortController();
    this.request = controller;
    const generation = ++this.generation;
    const acquired: Array<() => void> = [];
    if (!this.regions.length)
      this.status.textContent =
        this.base.locale === 'en-US' ? 'Loading cells' : '正在读取单元格';
    void Promise.all(
      regions.map(async (region) => {
        // 补齐区只在视图中生成，不向解析器请求超出源数据的范围。
        const range = {
          ...region.range,
          endRow: Math.min(region.range.endRow, this.layout.rowCount),
          endColumn: Math.min(region.range.endColumn, this.layout.columnCount),
        };
        if (
          range.startRow > range.endRow ||
          range.startColumn > range.endColumn
        ) {
          const data: SpreadsheetRangeData = {
            revision: 0,
            range: region.range,
            cells: [],
            rows: [],
            columns: [],
            merges: [],
            images: [],
            charts: [],
          };
          return { ...region, data };
        }
        const data = await this.source.getRange(
          this.sheetId,
          range,
          controller.signal,
        );
        if (this.closed || controller.signal.aborted)
          throw new Error('cancelled');
        const release = this.source.retainRange(this.sheetId, data.range);
        acquired.push(release);
        return { ...region, data, release };
      }),
    ).then(
      (loaded) => {
        if (
          this.closed ||
          controller.signal.aborted ||
          generation !== this.generation
        ) {
          acquired.forEach((release) => release());
          return;
        }
        this.regions.forEach((region) => region.release?.());
        this.regions = loaded;
        this.status.textContent = '';
        if (!this.resizingColumns && this.updateReadingRows()) {
          this.updateAxes();
          this.schedule();
        }
        this.paint();
      },
      (error) => {
        const cancelled = controller.signal.aborted;
        controller.abort();
        acquired.forEach((release) => release());
        if (!this.closed && !cancelled && generation === this.generation) {
          this.status.textContent = String(error);
          const retry = this.base.document.createElement('button');
          retry.type = 'button';
          retry.textContent = this.base.locale === 'en-US' ? 'Retry' : '重试';
          retry.onclick = () => {
            this.signature = '';
            this.schedule();
          };
          this.status.append(retry);
        }
      },
    );
  }
  private visibleAxes(region: Region) {
    const rows: Array<{ index: number; height: number; hidden: boolean }> = [],
      columns: Array<{ index: number; width: number; hidden: boolean }> = [];
    for (let index = region.range.startRow; index <= region.range.endRow; ) {
      const height = this.rowAxis.sizeAt(index);
      if (height > 0) rows.push({ index, height, hidden: false });
      index =
        height > 0
          ? index + 1
          : Math.max(
              index + 1,
              this.rowAxis.findIndexAtOffset(
                this.rowAxis.offsetAt(index) + 0.001,
              ),
            );
    }
    for (
      let index = region.range.startColumn;
      index <= region.range.endColumn;

    ) {
      const width = this.columnAxis.sizeAt(index);
      if (width > 0) columns.push({ index, width, hidden: false });
      index =
        width > 0
          ? index + 1
          : Math.max(
              index + 1,
              this.columnAxis.findIndexAtOffset(
                this.columnAxis.offsetAt(index) + 0.001,
              ),
            );
    }
    for (const merge of region.data?.merges ?? []) {
      // 缓存可能覆盖更大的窗口，只为当前区域补回相交合并单元格的锚点。
      if (
        merge.endRow < region.range.startRow ||
        merge.startRow > region.range.endRow ||
        merge.endColumn < region.range.startColumn ||
        merge.startColumn > region.range.endColumn
      )
        continue;
      if (
        !rows.some((row) => row.index === merge.startRow) &&
        this.rowAxis.sizeAt(merge.startRow) > 0
      )
        rows.push({
          index: merge.startRow,
          height: this.rowAxis.sizeAt(merge.startRow),
          hidden: false,
        });
      if (
        !columns.some((column) => column.index === merge.startColumn) &&
        this.columnAxis.sizeAt(merge.startColumn) > 0
      )
        columns.push({
          index: merge.startColumn,
          width: this.columnAxis.sizeAt(merge.startColumn),
          hidden: false,
        });
    }
    return {
      rows: rows.sort((a, b) => a.index - b.index),
      columns: columns.sort((a, b) => a.index - b.index),
    };
  }
  private renderCells(
    region: Region,
    host: HTMLElement,
    reuse: boolean,
    metrics: SpreadsheetGridMetrics,
  ) {
    const data = region.data;
    if (!data) return;
    const { rows, columns } = this.visibleAxes(region);
    const byCell = new Map(
      data.cells.map((cell) => [cell.rowIndex + ':' + cell.columnIndex, cell]),
    );
    const merges = new Map<string, SpreadsheetMerge>();
    for (const merge of data.merges)
      for (const row of rows)
        if (row.index >= merge.startRow && row.index <= merge.endRow)
          for (const column of columns)
            if (
              column.index >= merge.startColumn &&
              column.index <= merge.endColumn
            )
              merges.set(row.index + ':' + column.index, merge);
    const bounds = new Map<string, SpreadsheetCellContentBounds>();
    if (this.mode === 'source' && region.kind === 'body') {
      const widths = columns.map((column) =>
        this.columnAxis.sizeAt(column.index),
      );
      for (const row of rows) {
        const occupied = columns.map(
          (column) =>
            merges.has(row.index + ':' + column.index) ||
            isSpreadsheetCellOccupied(
              byCell.get(row.index + ':' + column.index),
            ),
        );
        const entries = columns.flatMap((column, columnOffset) => {
          const key = row.index + ':' + column.index,
            merge = merges.get(key);
          if (
            merge &&
            (merge.startRow !== row.index || merge.startColumn !== column.index)
          )
            return [];
          const cell = byCell.get(key) ?? this.empty(row.index, column.index);
          return [
            {
              key,
              cell,
              columnOffset,
              columnSpan: merge
                ? columns.filter(
                    (col) =>
                      col.index >= merge.startColumn &&
                      col.index <= merge.endColumn,
                  ).length
                : 1,
              clipped: !!(
                cell.style?.wrapText ||
                cell.style?.shrinkToFit ||
                merge
              ),
            },
          ];
        });
        buildSpreadsheetRowContentBounds(entries, occupied, widths).forEach(
          (value, key) => bounds.set(key, value),
        );
      }
    }
    const logicalLeft = metrics.pinX,
      logicalTop = metrics.pinY;
    for (const row of rows) {
      const rowKey = region.kind + ':' + row.index;
      this.usedRows.add(rowKey);
      let rowHost = reuse ? this.rowNodes.get(rowKey) : undefined;
      if (!rowHost) {
        rowHost = createDom(this.base.document, 'div', {
          role: 'row',
          'aria-rowindex': row.index,
        }) as HTMLElement;
        this.rowNodes.set(rowKey, rowHost);
        if (reuse) {
          const next = Array.from(host.children).find(
            (node) => +(node.getAttribute('aria-rowindex') ?? 0) > row.index,
          );
          host.insertBefore(rowHost, next ?? null);
        } else host.append(rowHost);
      }
      for (const column of columns) {
        const key = row.index + ':' + column.index,
          merge = merges.get(key);
        if (
          merge &&
          (merge.startRow !== row.index || merge.startColumn !== column.index)
        )
          continue;
        const cell = byCell.get(key) ?? this.empty(row.index, column.index);
        const width = this.columnAxis.rangeSize(
            column.index,
            merge?.endColumn ?? column.index,
          ),
          height = this.rowAxis.rangeSize(
            row.index,
            merge?.endRow ?? row.index,
          );
        const style = cell.style ?? {};
        const border = style.border
          ? (style.borderWidth ?? 1) +
            'px solid ' +
            (style.borderColor ?? '#b9c2d0')
          : '1px solid #d9e0ea';
        const frozen = region.kind !== 'body';
        const geometry = {
          left:
            ROW_HEADER +
            this.columnAxis.offsetAt(column.index) +
            (region.kind === 'columns' || region.kind === 'corner'
              ? logicalLeft
              : 0),
          top:
            HEADER +
            this.rowAxis.offsetAt(row.index) +
            (region.kind === 'rows' || region.kind === 'corner'
              ? logicalTop
              : 0),
          width,
          height,
          minHeight: height,
        };
        const renderContent = () =>
          this.cellView({
            cell,
            sheetId: this.sheetId,
            sourceId: this.sheetId + ':' + cell.ref,
            contentWidth: width,
            contentHeight:
              this.mode === 'source' || isSpreadsheetShrinkToFitCell(cell)
                ? height
                : undefined,
            clipped:
              this.mode === 'reading'
                ? isSpreadsheetShrinkToFitCell(cell)
                : !!(style.wrapText || style.shrinkToFit || merge),
            contentBounds: this.mode === 'source' ? bounds.get(key) : undefined,
            viewMode: this.mode,
          });
        const nodeKey = region.kind + ':' + key;
        this.usedCells.add(nodeKey);
        const contentKey = JSON.stringify([width, height, bounds.get(key)]);
        const existing = reuse ? this.cellNodes.get(nodeKey) : undefined;
        if (existing) {
          const changed: Partial<typeof geometry> = {};
          for (const key of [
            'left',
            'top',
            'width',
            'height',
            'minHeight',
          ] as const)
            if (existing.geometry[key] !== geometry[key])
              changed[key] = geometry[key];
          applyDomStyle(existing.node, changed);
          existing.geometry = geometry;
          // 只有文字可用边界变化时才更新内容，其他列仅平移已有节点。
          if (
            existing.contentKey !== contentKey &&
            !this.gridInteraction.controller.preservesText(existing.node)
          ) {
            existing.node.replaceChildren(renderContent());
            existing.contentKey = contentKey;
          }
          continue;
        }
        const node = createDom(
          this.base.document,
          'div',
          {
            className:
              'office-file-xlsx-virtual-grid__cell' +
              (frozen ? ' office-file-xlsx-virtual-grid__cell--frozen' : ''),
            'data-office-spreadsheet-cell': cell.ref,
            'data-grid-row': String(row.index - 1),
            'data-grid-column': String(column.index - 1),
            tabIndex: -1,
            title: cell.value,
            style: {
              ...buildXlsxCellStyle(
                cell,
                this.mode,
                this.base.services.fonts.resolveFamily,
              ),
              position: 'absolute',
              ...geometry,
              fontSize:
                style.fontSize ?? (isHighlightedXlsxCell(style) ? 14 : 13),
              borderTop: style.borderTop ?? border,
              borderRight: style.borderRight ?? border,
              borderBottom: style.borderBottom ?? border,
              borderLeft: style.borderLeft ?? border,
              zIndex: frozen ? 10 : cell.value ? 2 : 1,
              background: frozen
                ? style.backgroundColor ?? '#fff'
                : style.backgroundColor,
              boxShadow: frozen ? '1px 1px 0 #91a0b3' : undefined,
            },
          },
          renderContent(),
        );
        if (reuse) {
          const next = Array.from(rowHost.children).find(
            (item) =>
              +(item.getAttribute('data-grid-column') ?? -1) > column.index - 1,
          );
          rowHost.insertBefore(node, next ?? null);
        } else rowHost.appendChild(node);
        this.cellNodes.set(nodeKey, {
          node: node as HTMLElement,
          contentKey,
          geometry,
        });
      }
    }
  }
  private paint() {
    if (this.closed || !this.active) return;
    this.setScrollLeft(this.element.scrollLeft);
    const geometry = {
      host: this.element,
      layout: this.layout,
      rows: this.rowAxis,
      columns: this.columnAxis,
      scale: this.scale(),
    };
    const metrics = spreadsheetGridMetrics(geometry);
    const clips = spreadsheetGridPaneClips(
      geometry,
      this.canvasSize.width,
      this.canvasSize.height,
      metrics,
    );
    applyDomStyle(this.cells, { clipPath: clips.body });
    for (const kind of ['rows', 'columns', 'corner'] as const)
      applyDomStyle(this.panes[kind], { clipPath: clips[kind] });
    const reuse =
      this.gridInteraction.controller.hasTextSelection ||
      (this.resizingColumns &&
        this.paintedRegions?.length === this.regions.length &&
        this.regions.every((region) =>
          this.paintedRegions?.some(
            (previous) =>
              previous.kind === region.kind && previous.data === region.data,
          ),
        ));
    this.usedRows.clear();
    this.usedCells.clear();
    if (!reuse) {
      this.cells.replaceChildren();
      for (const pane of Object.values(this.panes)) pane.replaceChildren();
      this.headers.replaceChildren();
      this.rowNodes.clear();
      this.cellNodes.clear();
    }
    for (const region of this.regions)
      this.renderCells(
        region,
        region.kind === 'body' ? this.cells : this.panes[region.kind],
        reuse,
        metrics,
      );
    // 列宽变化可能减少补齐列或可见列，仅移除离开窗口的节点。
    if (reuse) {
      for (const [key, cell] of this.cellNodes)
        if (!this.usedCells.has(key)) {
          if (this.gridInteraction.controller.preservesText(cell.node)) {
            const [kind, row, column] = key.split(':');
            applyDomStyle(cell.node, {
              left:
                ROW_HEADER +
                this.columnAxis.offsetAt(+column) +
                (kind === 'columns' || kind === 'corner' ? metrics.pinX : 0),
              top:
                HEADER +
                this.rowAxis.offsetAt(+row) +
                (kind === 'rows' || kind === 'corner' ? metrics.pinY : 0),
            });
            continue;
          }
          cell.node.remove();
          this.cellNodes.delete(key);
        }
      for (const [key, row] of this.rowNodes)
        if (
          !this.usedRows.has(key) &&
          !this.gridInteraction.controller.preservesText(row)
        ) {
          row.remove();
          this.rowNodes.delete(key);
        }
    }
    this.paintedRegions = this.regions;
    const body = this.regions.find((region) => region.kind === 'body');
    const data = body?.data;
    if (!data || !body) {
      this.gridInteraction?.refresh();
      return;
    }
    const visible = this.visibleAxes(body);
    renderSpreadsheetGridHeaders(
      this.headers,
      geometry,
      visible.rows,
      visible.columns,
      this.base.locale,
      reuse,
      metrics,
    );
    const owners = new Set<string>();
    for (const image of data.images) {
      const id = 'image:' + image.id;
      owners.add(id);
      this.context.owner = id;
      const source =
        typeof image.src === 'string'
          ? { kind: 'url' as const, url: image.src }
          : image.src;
      const resource = this.context.resource(source);
      let node = this.images.get(id);
      if (!node || (!node.getAttribute('src') && resource.url)) {
        node?.remove();
        node = this.context.previewableImage({
          ...this.context.linkProps({
            hyperlink: image.hyperlink,
            source: { type: 'image', id: image.id },
          }),
          src: resource.url,
          previewId: image.id,
          previewName: image.name,
          previewSource: source,
          alt: image.alt ?? '',
          className: 'office-file-xlsx-sheet-grid__floating-image',
        }) as HTMLElement;
        this.images.set(id, node);
        node.dataset.gridInteractive = '';
        this.objects.append(node);
      }
      if (resource.url) node.setAttribute('src', resource.url);
      const horizontal = remapSpreadsheetVerticalRange(
        image.x,
        image.width,
        this.sourceColumnAxis,
        this.columnAxis,
      );
      const vertical = remapSpreadsheetVerticalRange(
        image.y,
        image.height,
        this.sourceRowAxis,
        this.rowAxis,
      );
      applyDomStyle(node, {
        left: ROW_HEADER + horizontal.y,
        top: HEADER + vertical.y,
        width: horizontal.height,
        height: vertical.height,
      });
    }
    for (const [id, node] of this.images)
      if (!owners.has(id)) {
        node.remove();
        this.images.delete(id);
      }
    for (const item of data.charts) {
      const id = 'chart:' + item.id;
      owners.add(id);
      const horizontal = remapSpreadsheetVerticalRange(
        item.x,
        item.width,
        this.sourceColumnAxis,
        this.columnAxis,
      );
      const vertical = remapSpreadsheetVerticalRange(
        item.y,
        item.height,
        this.sourceRowAxis,
        this.rowAxis,
      );
      let chart = this.charts.get(id);
      if (!chart) {
        const node = createDom(this.base.document, 'div', {
          ...this.context.linkProps({
            hyperlink: item.hyperlink,
            source: { type: 'shape', id: item.id },
          }),
          className: 'office-file-xlsx-sheet-grid__floating-chart',
        }) as HTMLElement;
        this.objects.append(node);
        chart = {
          node,
          view: mountChart(
            node,
            {
              chart: item.chart,
              width: horizontal.height,
              height: vertical.height,
            },
            this.base,
          ),
          model: item.chart,
          width: horizontal.height,
          height: vertical.height,
        };
        node.dataset.gridInteractive = '';
        this.charts.set(id, chart);
      }
      applyDomStyle(chart.node, {
        left: ROW_HEADER + horizontal.y,
        top: HEADER + vertical.y,
        width: horizontal.height,
        height: vertical.height,
      });
      if (
        !this.resizingColumns &&
        (chart.model !== item.chart ||
          chart.width !== horizontal.height ||
          chart.height !== vertical.height)
      ) {
        chart.model = item.chart;
        chart.width = horizontal.height;
        chart.height = vertical.height;
        void chart.view.update({
          chart: item.chart,
          width: horizontal.height,
          height: vertical.height,
        });
      }
    }
    for (const [id, chart] of this.charts)
      if (!owners.has(id)) {
        chart.view.dispose();
        chart.node.remove();
        this.charts.delete(id);
      }
    this.context.retainOwners(owners);
    this.gridInteraction?.refresh();
  }
  /** 列宽覆盖不写入源布局；手动调整沿用当前比例，避免自动适应回跳。 */
  private changeColumnWidth(
    column: number | undefined,
    width: number | undefined,
  ) {
    if (column === undefined && !this.columnWidths.size) return;
    if (column !== undefined && this.columnWidths.get(column) === width) return;
    this.gridInteraction.controller.clearTextSelection();
    const old = this.columnAxis,
      left = this.element.scrollLeft / this.scale();
    const anchor = old.findIndexAtOffset(left),
      offset = left - old.offsetAt(anchor);
    if (column === undefined) this.columnWidths.clear();
    else if (width === undefined) this.columnWidths.delete(column);
    else this.columnWidths.set(column, width);
    this.resizeChanged = true;
    if (this.base.services.state.getState().zoomMode !== 'percentage')
      void this.base.services.state
        .execute({ type: 'zoom', value: this.zoom })
        .catch(this.base.onError);
    // 拖动只更新列轴，保留行高、源轴和已读取的单元格。
    this.updateAxes(true);
    this.setScrollLeft(
      (this.columnAxis.offsetAt(anchor) +
        Math.min(Math.max(0, offset), this.columnAxis.sizeAt(anchor))) *
        this.scale(),
    );
    if (!this.resizingColumns) this.finishColumnResize();
    else this.schedule();
  }
  /** 松开或取消后使用最终列宽计算一次行高，允许列变宽时恢复较小的阅读行高。 */
  private finishColumnResize() {
    this.resizingColumns = false;
    if (this.closed) return;
    if (this.updateReadingRows(this.resizeChanged)) this.updateAxes();
    this.resizeChanged = false;
    this.paintedRegions = undefined;
    this.schedule();
  }
  /** 收窄列宽时按列轴限制位置，避免旧 DOM 尚未更新时使用过大的浏览器滚动上限。 */
  private setScrollLeft(value: number) {
    if (this.viewportSize.width <= 0) return;
    const max = Math.max(
      0,
      (this.canvasSize.width - this.viewportSize.width) * this.scale(),
    );
    const left = Math.max(0, Math.min(max, value));
    if (this.element.scrollLeft !== left) this.element.scrollLeft = left;
  }
  /** 从仍被保留的数据窗口计算行高，列宽变化不需要重新向解析器读取内容。 */
  private updateReadingRows(reset = false) {
    if (reset) this.reading.clear();
    let changed = reset;
    if (this.mode === 'reading') {
      const rows = reset ? this.sourceRowAxis : this.rowAxis;
      for (const region of this.regions) {
        if (!region.data) continue;
        for (const [row, height] of buildSpreadsheetReadingRowHeightUpdates(
          region.data,
          rows,
          this.columnAxis,
        )) {
          if (height > (this.reading.get(row) ?? 0)) {
            this.reading.set(row, height);
            changed = true;
          }
        }
      }
    }
    return changed;
  }
  /** 每个工作表分别保存逻辑阅读锚点与预览列宽。 */
  getState(): SpreadsheetGridState {
    const top = this.element.scrollTop / this.scale(),
      left = this.element.scrollLeft / this.scale();
    const row = this.rowAxis.findIndexAtOffset(top),
      column = this.columnAxis.findIndexAtOffset(left);
    return {
      ...this.gridInteraction.controller.getState(),
      widths: [...this.columnWidths],
      scroll: {
        row: row - 1,
        column: column - 1,
        rowOffset: top - this.rowAxis.offsetAt(row),
        columnOffset: left - this.columnAxis.offsetAt(column),
      },
    };
  }
  copy(): Promise<void> {
    return this.gridInteraction.copy();
  }
  resetColumnWidths(): void {
    this.gridInteraction.resetColumns();
  }
  private empty(row: number, column: number): SpreadsheetCell {
    return {
      rowIndex: row,
      columnIndex: column,
      ref: getSpreadsheetColumnLabel(column) + row,
      value: '',
    };
  }
  /** 更新比例或排版时保留行列锚点，避免把旧比例的滚动像素误当成新阅读位置。 */
  update(
    layout: SpreadsheetSheetLayout,
    zoom: number,
    mode: 'source' | 'reading',
  ) {
    this.gridInteraction.controller.clearTextSelection();
    const oldScale = this.scale();
    const top = this.element.scrollTop / oldScale;
    const left = this.element.scrollLeft / oldScale;
    const row = this.rowAxis.findIndexAtOffset(top);
    const column = this.columnAxis.findIndexAtOffset(left);
    const rowOffset = top - this.rowAxis.offsetAt(row);
    const columnOffset = left - this.columnAxis.offsetAt(column);
    this.paintedRegions = undefined;
    this.layout = layout;
    this.zoom = zoom;
    this.mode = mode;
    const scale = this.scale();
    this.viewportSize = {
      width: (this.viewportSize.width * oldScale) / scale,
      height: (this.viewportSize.height * oldScale) / scale,
    };
    this.updateAxes();
    this.element.scrollTop =
      (this.rowAxis.offsetAt(row) +
        Math.min(Math.max(0, rowOffset), this.rowAxis.sizeAt(row))) *
      scale;
    this.setScrollLeft(
      (this.columnAxis.offsetAt(column) +
        Math.min(Math.max(0, columnOffset), this.columnAxis.sizeAt(column))) *
        scale,
    );
    this.signature = '';
    this.schedule();
  }
  refresh() {
    this.paintedRegions = undefined;
    this.paint();
  }
  scrollToCell(row: number, column: number) {
    if (
      row < 1 ||
      column < 1 ||
      row > this.layout.rowCount ||
      column > this.layout.columnCount
    )
      return false;
    this.gridInteraction.controller.select({
      row: row - 1,
      column: column - 1,
    });
    this.signature = '';
    this.schedule();
    return true;
  }
  setActive(active: boolean) {
    this.active = active;
    this.gridInteraction.setActive(active);
    for (const chart of this.charts.values()) chart.view.setActive(active);
    if (active) this.schedule();
    else {
      this.cancel?.();
      this.request?.abort();
      this.signature = '';
    }
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.generation++;
    this.request?.abort();
    this.cancel?.();
    this.resize?.disconnect();
    this.gridInteraction.dispose();
    this.context.dispose();
    this.regions.forEach((region) => region.release?.());
    for (const chart of this.charts.values()) chart.view.dispose();
    this.charts.clear();
    this.rowNodes.clear();
    this.cellNodes.clear();
    this.element.remove();
  }
}
