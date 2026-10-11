// 从原 DocTableBlock 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import { DOC_STRUCTURED_TABLE_TOP_OFFSET } from '../../../engine/doc/docPagination';
import type { DocTableBlock as DocTableBlockModel } from '../../../engine/doc/types';
import { createDom } from '../../../view/dom/createDom';
import type { WordElementContext } from '../WordElementContext';
import { docTextStyleToCss } from '../docRenderUtils';
/** DOC表格内容块组件属性。 */
type DocTableBlockProps = {
  /** 当前负责处理或渲染的内容块。 */
  block: DocTableBlockModel;
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createDocTableBlockView(context: WordElementContext) {
  /** 渲染DOC表格内容块。 */
  function DocTableBlockComponent({ block }: DocTableBlockProps) {
    const resolveFontFamily = context.services.fonts.resolveFamily;
    const searchBlockId = block.sourceBlockId ?? block.id;
    const columnCount = Math.max(
      ...block.rows.map((row) => row.cells.length),
      1,
    );
    const borderColor = block.style?.borderColor ?? '#cfd7e3';
    const totalColumns =
      block.columns?.reduce((sum, width) => sum + width, 0) ?? 0;
    const hasRowSpans = block.rows.some((row) =>
      row.cells.some((cell) => Boolean(cell.rowSpan && cell.rowSpan > 1)),
    );
    const tableTopOffset = block.width ? DOC_STRUCTURED_TABLE_TOP_OFFSET : 0;
    const marginTop = tableTopOffset + (block.spacingBefore ?? 0);
    const marginLeft =
      block.width && block.align === 'center'
        ? `calc((100% - ${block.width}px) / 2)`
        : block.width && block.align === 'right'
        ? `calc(100% - ${block.width}px)`
        : block.offsetLeft;
    const wrapperStyle = {
      width: block.width,
      marginLeft,
      marginTop: marginTop || undefined,
      marginBottom: block.spacingAfter,
    };
    return createDom(
      context.document,
      'div',
      {
        className: `office-file-doc-table${
          block.width ? ' office-file-doc-table--document-grid' : ''
        }`,
        style: wrapperStyle,
        'data-office-word-block-id': searchBlockId,
      },
      createDom(
        context.document,
        'table',
        {
          className: 'office-file-doc-table__table',
          style: { width: '100%' },
        },
        block.columns?.length
          ? createDom(
              context.document,
              'colgroup',
              {},
              block.columns.map((width, index) =>
                createDom(context.document, 'col', {
                  key: `${block.id}-col-${index}`,
                  style: {
                    width: totalColumns
                      ? `${(width / totalColumns) * 100}%`
                      : width,
                  },
                }),
              ),
            )
          : null,
        createDom(
          context.document,
          'tbody',
          {},
          block.rows.map((row) => {
            // 空白模板行没有文本可撑高，沿用 Word 表格的标准占位行高。
            const emptyRowHeight =
              block.width &&
              row.cells.every(
                (cell) => !cell.text.trim() && !cell.inlines?.length,
              )
                ? 32
                : undefined;
            return createDom(
              context.document,
              'tr',
              {
                key: row.id,
                style: { height: row.height ?? emptyRowHeight },
              },
              row.cells.map((cell) =>
                createDom(
                  context.document,
                  'td',
                  {
                    key: cell.id,
                    className: 'office-file-doc-table__cell',
                    colSpan:
                      cell.colSpan && cell.colSpan > 1
                        ? cell.colSpan
                        : undefined,
                    rowSpan:
                      cell.rowSpan && cell.rowSpan > 1
                        ? cell.rowSpan
                        : undefined,
                    style: {
                      borderTop: cell.borderTop ?? `1px solid ${borderColor}`,
                      borderRight:
                        cell.borderRight ?? `1px solid ${borderColor}`,
                      borderBottom:
                        cell.borderBottom ?? `1px solid ${borderColor}`,
                      borderLeft: cell.borderLeft ?? `1px solid ${borderColor}`,
                      width: cell.width,
                      verticalAlign: cell.verticalAlign ?? 'top',
                      ...docTextStyleToCss(cell.style, resolveFontFamily),
                      // Chromium 会把宋体粗体字面横向栅格化到整数像素，微调字距以匹配 Word 的字体度量。
                      letterSpacing:
                        block.width &&
                        (cell.style?.fontWeight ?? 0) >= 700 &&
                        /(?:SimSun|宋体)/i.test(cell.style?.fontFamily ?? '')
                          ? -1.25
                          : undefined,
                      // 结构化 DOC 表格按 Word 自动行高补偿浏览器字体度量。
                      paddingTop:
                        cell.style?.paddingTop ??
                        (block.width ? 3.5 : undefined),
                      paddingBottom:
                        cell.style?.paddingBottom ??
                        (block.width ? 3.5 : undefined),
                    },
                  },
                  createDom(
                    context.document,
                    context.component('DocInlineContent'),
                    {
                      inlines: cell.inlines,
                      fallback: cell.text,
                      sourceId: cell.id,
                      searchBlockId: searchBlockId,
                      wordTableLineBreaks: Boolean(block.width),
                    },
                  ),
                ),
              ),
              !hasRowSpans &&
                row.cells.reduce(
                  (count, cell) => count + Math.max(1, cell.colSpan ?? 1),
                  0,
                ) < columnCount
                ? Array.from({
                    length:
                      columnCount -
                      row.cells.reduce(
                        (count, cell) => count + Math.max(1, cell.colSpan ?? 1),
                        0,
                      ),
                  }).map((_, index) =>
                    createDom(context.document, 'td', {
                      key: `${row.id}-empty-${index}`,
                      className: 'office-file-doc-table__cell',
                      style: { border: `1px solid ${borderColor}` },
                    }),
                  )
                : null,
            );
          }),
        ),
      ),
    );
  }
  const DocTableBlock = DocTableBlockComponent;
  return DocTableBlock;
}
