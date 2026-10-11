// 从原 TableRenderer 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import { resolveOfficeCssFontWeight } from '../../../engine/fonts/OfficeFontResolver';
import type { OfficeFontFamilyResolver } from '../../../engine/fonts/types';
import type {
  TableElement,
  TextRun,
  TextStyle,
} from '../../../engine/pptx/types';
import { createDom } from '../../../view/dom/createDom';
import type { PresentationElementContext } from '../PresentationElementContext';
import { resolvePptxFontFamily } from '../support/fontFamily';
import { resolvePresentationLineHeight } from '../support/textStyle';
/** 表格渲染器组件属性。 */
type TableRendererProps = {
  /** 当前处理或渲染的演示文稿元素。 */
  element: TableElement;
  /** 是否允许表格对象和内部文字响应链接交互。 */
  interactive: boolean;
  /** 主视口中的零基幻灯片索引；未提供时不渲染查找高亮。 */
  searchSlideIndex?: number;
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createTableView(context: PresentationElementContext) {
  function colorWithOpacity(color?: string, opacity?: number) {
    if (!color || opacity === undefined || opacity >= 1) return color;
    const normalized = color.replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return color;
    const value = Number.parseInt(normalized, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  /** 渲染表格内单个文字片段并绑定可选链接。 */
  function TableTextRun({
    run,
    cellStyle,
    sourceId,
    interactive,
    searchSlideIndex,
    elementId,
    resolveFontFamily,
  }: {
    /** 当前文字片段。 */
    run: TextRun;
    /** 当前单元格继承的基础文字样式。 */
    cellStyle?: TextStyle;
    /** 当前片段在文稿中的稳定来源标识。 */
    sourceId: string;
    /** 是否允许当前文字片段响应链接交互。 */
    interactive: boolean;
    /** 主视口中的零基幻灯片索引。 */
    searchSlideIndex?: number;
    /** 当前表格元素的稳定标识。 */
    elementId: string;
    /** 当前文档会话统一的字体链解析函数。 */
    resolveFontFamily: OfficeFontFamilyResolver;
  }) {
    const hyperlinkProps = context.linkProps({
      hyperlink: run.hyperlink,
      source: { type: 'text', id: sourceId },
      interactive,
    });
    return createDom(
      context.document,
      'span',
      {
        ...hyperlinkProps,
        style: {
          color: run.style?.color ?? cellStyle?.color,
          fontFamily: resolvePptxFontFamily(
            resolveFontFamily,
            run.style?.fontFamily ?? cellStyle?.fontFamily,
            run.style?.eastAsiaFontFamily ?? cellStyle?.eastAsiaFontFamily,
          ),
          fontSize: run.style?.fontSize ?? cellStyle?.fontSize,
          fontWeight: resolveOfficeCssFontWeight(
            run.style?.fontWeight ?? cellStyle?.fontWeight,
            run.style?.bold ?? cellStyle?.bold,
            run.style?.fontFamily ?? cellStyle?.fontFamily,
          ),
          fontStyle:
            run.style?.italic || cellStyle?.italic ? 'italic' : 'normal',
          textDecoration:
            [
              run.style?.underline || cellStyle?.underline ? 'underline' : '',
              run.style?.strike && run.style.strike !== 'none'
                ? 'line-through'
                : '',
            ]
              .filter(Boolean)
              .join(' ') || 'none',
          letterSpacing: run.style?.charSpace ?? cellStyle?.charSpace ?? 0,
        },
      },
      searchSlideIndex === undefined
        ? run.text
        : createDom(context.document, context.highlight, {
            text: run.text,
            target: {
              kind: 'presentation',
              slideIndex: searchSlideIndex,
              elementId,
            },
          }),
    );
  }
  /** 渲染表格渲染器。 */
  function TableRendererComponent({
    element,
    interactive,
    searchSlideIndex,
  }: TableRendererProps) {
    const resolveFontFamily = context.services.fonts.resolveFamily;
    const columnWidths = element.columnWidths ?? [];
    const rowHeights = element.rowHeights ?? [];
    const hyperlinkProps = context.linkProps({
      hyperlink: element.hyperlink,
      source: { type: 'shape', id: element.id },
      interactive,
    });
    return createDom(
      context.document,
      'table',
      {
        ...hyperlinkProps,
        'data-office-presentation-element-id':
          searchSlideIndex === undefined ? undefined : element.id,
        'data-office-presentation-slide-index': searchSlideIndex,
        style: {
          position: 'absolute',
          left: element.x,
          top: element.y,
          width: element.width,
          height: element.height,
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          color: '#172033',
          fontFamily: 'inherit',
          fontSize: 12,
          background: 'transparent',
        },
      },
      createDom(
        context.document,
        'tbody',
        {},
        element.rows.map((row, rowIndex) =>
          createDom(
            context.document,
            'tr',
            {
              key: rowIndex,
              style: {
                height: rowHeights[rowIndex],
              },
            },
            row.map((cell, cellIndex) =>
              createDom(
                context.document,
                'td',
                {
                  key: cellIndex,
                  style: {
                    width: columnWidths[cellIndex],
                    background: colorWithOpacity(
                      cell.backgroundColor ?? undefined,
                      cell.backgroundOpacity,
                    ),
                    borderStyle: cell.borderColor ? 'solid' : 'none',
                    borderColor:
                      colorWithOpacity(
                        cell.borderColor ?? undefined,
                        cell.borderOpacity,
                      ) ?? 'transparent',
                    borderWidth: cell.borderWidth ?? 1,
                    padding: `${cell.margins?.top ?? 0}px ${
                      cell.margins?.right ?? 0
                    }px ${cell.margins?.bottom ?? 0}px ${
                      cell.margins?.left ?? 0
                    }px`,
                    verticalAlign: cell.verticalAlign ?? 'middle',
                    fontFamily: resolvePptxFontFamily(
                      resolveFontFamily,
                      cell.style?.fontFamily,
                      cell.style?.eastAsiaFontFamily,
                    ),
                    overflow: 'hidden',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  },
                },
                cell.paragraphs?.length
                  ? cell.paragraphs.map((paragraph, paragraphIndex) =>
                      createDom(
                        context.document,
                        'div',
                        {
                          key: paragraphIndex,
                          style: {
                            textAlign:
                              paragraph.style?.align ??
                              cell.style?.align ??
                              'left',
                            lineHeight: resolvePresentationLineHeight(
                              paragraph.style?.lineHeight ??
                                cell.style?.lineHeight,
                            ),
                            whiteSpace: 'inherit',
                          },
                        },
                        paragraph.runs.map((run, runIndex) =>
                          createDom(context.document, TableTextRun, {
                            key: runIndex,
                            run: run,
                            cellStyle: cell.style,
                            sourceId: `${element.id}:${rowIndex}:${cellIndex}:${paragraphIndex}:${runIndex}`,
                            interactive: interactive,
                            searchSlideIndex: searchSlideIndex,
                            elementId: element.id,
                            resolveFontFamily: resolveFontFamily,
                          }),
                        ),
                      ),
                    )
                  : searchSlideIndex === undefined
                  ? cell.text
                  : createDom(context.document, context.highlight, {
                      text: cell.text,
                      target: {
                        kind: 'presentation',
                        slideIndex: searchSlideIndex,
                        elementId: element.id,
                      },
                    }),
              ),
            ),
          ),
        ),
      ),
    );
  }
  const TableRenderer = TableRendererComponent;
  return TableRenderer;
}
