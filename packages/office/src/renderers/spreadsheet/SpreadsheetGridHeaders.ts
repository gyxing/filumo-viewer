import {
  applyDomStyle,
  createDom,
  type CSSProperties,
  type DomChild,
} from '../../view/dom/createDom';
import {
  XLSX_COLUMN_HEADER_HEIGHT as HEADER,
  XLSX_ROW_HEADER_WIDTH as ROW_HEADER,
  getSpreadsheetColumnLabel,
} from './sheetStyles';
import {
  spreadsheetGridMetrics,
  type SpreadsheetGridGeometry,
} from './SpreadsheetGridGeometry';

/** 冻结表头与正文采用同一坐标换算，手柄只出现在真实数据列。 */
export function renderSpreadsheetGridHeaders(
  host: HTMLElement,
  grid: SpreadsheetGridGeometry,
  visibleRows: readonly { index: number; hidden: boolean }[],
  visibleColumns: readonly { index: number; hidden: boolean }[],
  locale?: string,
  reuse = false,
  m = spreadsheetGridMetrics(grid),
): void {
  const document = host.ownerDocument;
  const existing = new Map(
    reuse
      ? Array.from(host.children, (node) => {
          const element = node as HTMLElement;
          return [element.dataset.gridHeaderKey, element] as const;
        })
      : [],
  );
  const used = new Set<string>();
  // 仅更新动态位置，拖动期间保留表头与键盘手柄，避免反复创建 DOM。
  const place = (
    key: string,
    props: { style: CSSProperties; [key: string]: unknown },
    children: () => DomChild[],
  ) => {
    used.add(key);
    const current = existing.get(key);
    if (current) {
      applyDomStyle(current, props.style);
      return;
    }
    const node = createDom(
      document,
      'div',
      props,
      ...children(),
    ) as HTMLElement;
    node.dataset.gridHeaderKey = key;
    host.append(node);
  };
  const rows = new Map(visibleRows.map((row) => [row.index, row])),
    columns = new Map(visibleColumns.map((column) => [column.index, column]));
  for (let index = 1; index <= m.frozenRows; index++)
    rows.set(index, { index, hidden: grid.rows.sizeAt(index) <= 0 });
  for (let index = 1; index <= m.frozenColumns; index++)
    columns.set(index, { index, hidden: grid.columns.sizeAt(index) <= 0 });
  const left = m.pinX,
    top = m.pinY;
  const right =
    (grid.host.scrollLeft + grid.host.clientWidth - m.x) / grid.scale;
  const bottom =
    (grid.host.scrollTop + grid.host.clientHeight - m.y) / grid.scale;
  // 表头也按冻结边界裁剪，避免滚动行号或列标题进入固定区域。
  const clip = (
    position: number,
    size: number,
    min: number,
    max: number,
    vertical: boolean,
  ) => {
    const start = Math.min(size, Math.max(0, min - position));
    const end = Math.max(start, Math.min(size, Math.max(0, max - position)));
    return vertical
      ? `inset(${start}px 0px ${size - end}px 0px)`
      : `inset(0px ${size - end}px 0px ${start}px)`;
  };
  for (const column of columns.values())
    if (!column.hidden) {
      const frozen = column.index <= m.frozenColumns;
      const position =
        ROW_HEADER + grid.columns.offsetAt(column.index) + (frozen ? left : 0);
      const width = grid.columns.sizeAt(column.index);
      place(
        'column:' + column.index,
        {
          className: 'office-file-xlsx-virtual-grid__column-header',
          role: 'columnheader',
          'data-grid-header-column': String(column.index - 1),
          'data-office-grid-filler':
            column.index > grid.layout.columnCount ? 'true' : undefined,
          style: {
            left: position,
            top,
            width,
            height: HEADER,
            clipPath: clip(
              position,
              width,
              left +
                ROW_HEADER +
                (frozen ? 0 : grid.columns.rangeSize(1, m.frozenColumns)),
              right,
              false,
            ),
            zIndex: frozen ? 22 : 21,
          },
        },
        () => [
          getSpreadsheetColumnLabel(column.index),
          column.index <= grid.layout.columnCount
            ? createDom(document, 'span', {
                className: 'filumo-grid-column-resize',
                'data-resize-column': String(column.index - 1),
                role: 'separator',
                style: { width: 6 / grid.scale },
                tabIndex: 0,
                'aria-orientation': 'vertical',
                'aria-label': locale === 'en-US' ? 'Resize column' : '调整列宽',
              })
            : null,
        ],
      );
    }
  for (const row of rows.values())
    if (!row.hidden) {
      const frozen = row.index <= m.frozenRows;
      const position =
        HEADER + grid.rows.offsetAt(row.index) + (frozen ? top : 0);
      const height = grid.rows.sizeAt(row.index);
      place(
        'row:' + row.index,
        {
          className: 'office-file-xlsx-virtual-grid__row-header',
          role: 'rowheader',
          'data-office-grid-filler':
            row.index > grid.layout.rowCount ? 'true' : undefined,
          style: {
            left,
            top: position,
            width: ROW_HEADER,
            height,
            clipPath: clip(
              position,
              height,
              top +
                HEADER +
                (frozen ? 0 : grid.rows.rangeSize(1, m.frozenRows)),
              bottom,
              true,
            ),
            zIndex: row.index <= m.frozenRows ? 22 : 21,
          },
        },
        () => [row.index],
      );
    }
  place(
    'corner',
    {
      className: 'office-file-xlsx-virtual-grid__corner',
      style: { left, top, width: ROW_HEADER, height: HEADER, zIndex: 23 },
    },
    () => [],
  );
  for (const [key, node] of existing) if (!key || !used.has(key)) node.remove();
}
