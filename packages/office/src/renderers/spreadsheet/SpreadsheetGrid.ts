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
  private frozen: HTMLDivElement;
  private objects: HTMLDivElement;
  private headers: HTMLDivElement;
  private status: HTMLDivElement;
  private context: OfficeElementContext;
  private cellView;
  private rowAxis: SpreadsheetAxisIndex;
  private sourceRowAxis: SpreadsheetAxisIndex;
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
  ) {
    const doc = base.document;
    const dom = createSpreadsheetGridDom(doc);
    this.element = dom.element;
    this.canvas = dom.canvas;
    this.cells = dom.cells;
    this.frozen = dom.frozen;
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
    this.context = new OfficeElementContext(base, () => this.schedule());
    this.cellView = createCellView(this.context);
    this.updateAxes();
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
  private updateAxes() {
    const old = this.rowAxis,
      scale = this.scale(),
      top = this.element.scrollTop / scale;
    const anchor = old.findIndexAtOffset(top),
      offset = top - old.offsetAt(anchor);
    this.sourceRowAxis = createSpreadsheetAxisIndex(
      this.layout.rowCount,
      this.layout.defaultRowHeight,
      this.layout.rows,
    );
    const rowMetrics =
      this.mode === 'source'
        ? this.layout.rows
        : mergeSpreadsheetReadingRowMetrics(this.layout.rows, this.reading);
    const rowSize = this.layout.defaultRowHeight || 20;
    const columnSize = this.layout.defaultColumnWidth || 64;
    const dataRows = createSpreadsheetAxisIndex(
      this.layout.rowCount,
      rowSize,
      rowMetrics,
    );
    const dataColumns = createSpreadsheetAxisIndex(
      this.layout.columnCount,
      columnSize,
      this.layout.columns,
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
    this.rowAxis = createSpreadsheetAxisIndex(
      this.displayRows,
      rowSize,
      rowMetrics,
    );
    this.columnAxis = createSpreadsheetAxisIndex(
      this.displayColumns,
      columnSize,
      this.layout.columns,
    );
    // 补齐区末行末列只占视口剩余空间，不能由空白网格制造额外滚动条。
    if (this.displayRows > this.layout.rowCount) {
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
          ...this.layout.columns.filter(
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
    if (top > 0)
      this.element.scrollTop =
        (this.rowAxis.offsetAt(anchor) +
          Math.min(Math.max(0, offset), this.rowAxis.sizeAt(anchor))) *
        scale;
    const width =
        ROW_HEADER + this.columnAxis.rangeSize(1, this.displayColumns),
      height = HEADER + this.rowAxis.rangeSize(1, this.displayRows);
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
      const rows = Math.min(
          pane.frozenRows,
          this.rowAxis.findIndexAtOffset(view.height),
        ),
        columns = Math.min(
          pane.frozenColumns,
          this.columnAxis.findIndexAtOffset(view.width),
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
        let changed = false;
        if (this.mode === 'reading')
          for (const region of loaded)
            for (const [row, height] of buildSpreadsheetReadingRowHeightUpdates(
              region.data!,
              this.rowAxis,
              this.columnAxis,
            )) {
              if (height > (this.reading.get(row) ?? 0)) {
                this.reading.set(row, height);
                changed = true;
              }
            }
        if (changed) {
          this.updateAxes();
          this.signature = '';
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
  private renderCells(region: Region, host: HTMLElement) {
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
    const logicalLeft = this.element.scrollLeft / this.scale(),
      logicalTop = this.element.scrollTop / this.scale();
    for (const row of rows)
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
        const node = createDom(
          this.base.document,
          'div',
          {
            className:
              'office-file-xlsx-virtual-grid__cell' +
              (frozen ? ' office-file-xlsx-virtual-grid__cell--frozen' : ''),
            'data-office-spreadsheet-cell': cell.ref,
            tabIndex: -1,
            title: cell.value,
            style: {
              ...buildXlsxCellStyle(
                cell,
                this.mode,
                this.base.services.fonts.resolveFamily,
              ),
              position: 'absolute',
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
          }),
        );
        host.append(node);
      }
  }
  private paint() {
    if (this.closed || !this.active) return;
    this.cells.replaceChildren();
    this.frozen.replaceChildren();
    this.headers.replaceChildren();
    for (const region of this.regions)
      this.renderCells(
        region,
        region.kind === 'body' ? this.cells : this.frozen,
      );
    const body = this.regions.find((region) => region.kind === 'body');
    const data = body?.data;
    if (!data || !body) return;
    const visible = this.visibleAxes(body);
    const left = Math.max(
        0,
        this.element.scrollLeft / this.scale() - 16 / this.scale(),
      ),
      top = Math.max(
        0,
        this.element.scrollTop / this.scale() - 16 / this.scale(),
      );
    for (const column of visible.columns)
      if (!column.hidden)
        this.headers.append(
          createDom(
            this.base.document,
            'div',
            {
              className: 'office-file-xlsx-virtual-grid__column-header',
              'data-office-grid-filler':
                column.index > this.layout.columnCount ? 'true' : undefined,
              style: {
                left: ROW_HEADER + this.columnAxis.offsetAt(column.index),
                top,
                width: this.columnAxis.sizeAt(column.index),
                height: HEADER,
              },
            },
            getSpreadsheetColumnLabel(column.index),
          ),
        );
    for (const row of visible.rows)
      if (!row.hidden)
        this.headers.append(
          createDom(
            this.base.document,
            'div',
            {
              className: 'office-file-xlsx-virtual-grid__row-header',
              'data-office-grid-filler':
                row.index > this.layout.rowCount ? 'true' : undefined,
              style: {
                left,
                top: HEADER + this.rowAxis.offsetAt(row.index),
                width: ROW_HEADER,
                height: this.rowAxis.sizeAt(row.index),
              },
            },
            row.index,
          ),
        );
    this.headers.append(
      createDom(this.base.document, 'div', {
        className: 'office-file-xlsx-virtual-grid__corner',
        style: { left, top, width: ROW_HEADER, height: HEADER },
      }),
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
        this.objects.append(node);
      }
      if (resource.url) node.setAttribute('src', resource.url);
      const vertical = remapSpreadsheetVerticalRange(
        image.y,
        image.height,
        this.sourceRowAxis,
        this.rowAxis,
      );
      applyDomStyle(node, {
        left: ROW_HEADER + image.x,
        top: HEADER + vertical.y,
        width: image.width,
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
            { chart: item.chart, width: item.width, height: vertical.height },
            this.base,
          ),
          model: item.chart,
          width: item.width,
          height: vertical.height,
        };
        this.charts.set(id, chart);
      }
      applyDomStyle(chart.node, {
        left: ROW_HEADER + item.x,
        top: HEADER + vertical.y,
        width: item.width,
        height: vertical.height,
      });
      if (
        chart.model !== item.chart ||
        chart.width !== item.width ||
        chart.height !== vertical.height
      ) {
        chart.model = item.chart;
        chart.width = item.width;
        chart.height = vertical.height;
        void chart.view.update({
          chart: item.chart,
          width: item.width,
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
  }
  private empty(row: number, column: number): SpreadsheetCell {
    return {
      rowIndex: row,
      columnIndex: column,
      ref: getSpreadsheetColumnLabel(column) + row,
      value: '',
    };
  }
  update(
    layout: SpreadsheetSheetLayout,
    zoom: number,
    mode: 'source' | 'reading',
  ) {
    this.layout = layout;
    this.zoom = zoom;
    this.mode = mode;
    this.updateAxes();
    this.signature = '';
    this.schedule();
  }
  refresh() {
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
    this.element.scrollTo({
      top: Math.max(
        0,
        (HEADER + this.rowAxis.offsetAt(row) + this.rowAxis.sizeAt(row) / 2) *
          this.scale() -
          this.element.clientHeight / 2,
      ),
      left: Math.max(
        0,
        (ROW_HEADER +
          this.columnAxis.offsetAt(column) +
          this.columnAxis.sizeAt(column) / 2) *
          this.scale() -
          this.element.clientWidth / 2,
      ),
    });
    this.signature = '';
    this.schedule();
    return true;
  }
  setActive(active: boolean) {
    this.active = active;
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
    this.context.dispose();
    this.regions.forEach((region) => region.release?.());
    for (const chart of this.charts.values()) chart.view.dispose();
    this.charts.clear();
    this.element.remove();
  }
}
