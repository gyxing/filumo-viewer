import type { OfficeRelationship } from '../ooxml/media';
import { attr, childByLocalName, childrenByLocalName, descendantByLocalName, textContent } from '../ooxml/xml';
import type { TableCellStyle, TableStyleDefinition, TableStyleMap } from './PptxPackageContext';
import { parsePptxHyperlink, type PptxSlideTargetMap } from './parsePptxHyperlink';
import { parseAlphaNode, parseColorNode } from './parsePptxPaint';
import type { TableCell, TableElement, TextRun, TextStyle, ThemeModel } from './types';

/** 复用幻灯片的统一样式解析，表格模块不反向依赖页面编排模块。 */
interface TableStyleReaders {
  readParagraphLevelStyle(node: Element | null, theme: ThemeModel): TextStyle;
  readDefaultRunStyle(node: Element | null, theme: ThemeModel): TextStyle;
  mergeTextStyles(...styles: Array<TextStyle | undefined>): TextStyle;
  mergeTableCellStyle(...styles: Array<TableCellStyle | undefined>): TableCellStyle;
  emuValue(node: Element | null, name: string): number | undefined;
}

/** 表格单独处理单元格、条件样式和几何；共享样式规则由上层注入。 */
export function createPptxTableParser(readers: TableStyleReaders) {
  const { readParagraphLevelStyle, readDefaultRunStyle, mergeTextStyles,
    mergeTableCellStyle, emuValue } = readers;

  function parseTableCellText(
    cellNode: Element,
    theme: ThemeModel,
    relationships: Record<string, OfficeRelationship>,
    slideTargets?: PptxSlideTargetMap,
  ) {
    const txBody = childByLocalName(cellNode, 'txBody');
    const paragraphs = childrenByLocalName(txBody, 'p').map((paragraphNode) => {
      const paragraphProps = childByLocalName(paragraphNode, 'pPr');
      const paragraphStyle = readParagraphLevelStyle(paragraphProps, theme);
      const defaultRunStyle = mergeTextStyles(
        readDefaultRunStyle(childByLocalName(paragraphProps, 'defRPr'), theme),
        readDefaultRunStyle(childByLocalName(paragraphNode, 'endParaRPr'), theme),
      );
      const runs: TextRun[] = [];

      Array.from(paragraphNode.children).forEach((child) => {
        if (child.localName === 'r' || child.localName === 'fld') {
          const runProps = childByLocalName(child, 'rPr');
          runs.push({
            text:
              textContent(childByLocalName(child, 't')) ||
              child.textContent ||
              '',
            hyperlink: parsePptxHyperlink(runProps, relationships, slideTargets),
            style: mergeTextStyles(
              defaultRunStyle,
              readDefaultRunStyle(runProps, theme),
            ),
          });
          return;
        }

        if (child.localName === 'br') {
          const runProps = childByLocalName(child, 'rPr');
          runs.push({
            text: '\n',
            style: mergeTextStyles(
              defaultRunStyle,
              readDefaultRunStyle(runProps, theme),
            ),
          });
        }
      });

      if (!runs.length && paragraphNode.textContent) {
        runs.push({ text: paragraphNode.textContent, style: defaultRunStyle });
      }

      return {
        runs,
        style: paragraphStyle,
        bullet: paragraphStyle.bullet,
      };
    });

    const text = paragraphs
      .map((paragraph) => paragraph.runs.map((run) => run.text).join(''))
      .join('\n');
    const firstRunStyle = paragraphs
      .flatMap((paragraph) => paragraph.runs)
      .find(Boolean)?.style;

    return { text, paragraphs, firstRunStyle };
  }

  function parseTableBorder(tcPr: Element | null, theme: ThemeModel) {
    const line =
      childByLocalName(tcPr, 'ln') ??
      childByLocalName(tcPr, 'lnL') ??
      childByLocalName(tcPr, 'lnR') ??
      childByLocalName(tcPr, 'lnT') ??
      childByLocalName(tcPr, 'lnB');
    if (!line) return {};
    if (childByLocalName(line, 'noFill')) {
      return {
        borderColor: null,
      };
    }
    const fill = childByLocalName(line, 'solidFill') ?? line;
    return {
      borderColor: parseColorNode(fill, theme),
      borderOpacity: parseAlphaNode(fill),
      borderWidth: attr(line, 'w') ? Number(attr(line, 'w')) / 12700 : undefined,
    };
  }

  function tableFlag(node: Element | null, name: string) {
    return attr(node, name) === '1' || attr(node, name) === 'true';
  }

  /** 解析并确定 `resolveTableCellStyle` 对应的引用或配置。 */
  function resolveTableCellStyle(
    style: TableStyleDefinition | undefined,
    tblPr: Element | null,
    rowIndex: number,
    columnIndex: number,
    rowCount: number,
    columnCount: number,
  ) {
    if (!style) return {};
    const isFirstRow = tableFlag(tblPr, 'firstRow') && rowIndex === 0;
    const isLastRow = tableFlag(tblPr, 'lastRow') && rowIndex === rowCount - 1;
    const isFirstCol = tableFlag(tblPr, 'firstCol') && columnIndex === 0;
    const isLastCol =
      tableFlag(tblPr, 'lastCol') && columnIndex === columnCount - 1;
    const bandRowOffset = tableFlag(tblPr, 'firstRow') ? 1 : 0;
    const bandColOffset = tableFlag(tblPr, 'firstCol') ? 1 : 0;
    const rowBand =
      tableFlag(tblPr, 'bandRow') && !isFirstRow && !isLastRow
        ? (rowIndex - bandRowOffset) % 2 === 0
          ? style.variants.band1H
          : style.variants.band2H
        : undefined;
    const colBand =
      tableFlag(tblPr, 'bandCol') && !isFirstCol && !isLastCol
        ? (columnIndex - bandColOffset) % 2 === 0
          ? style.variants.band1V
          : style.variants.band2V
        : undefined;

    return mergeTableCellStyle(
      style.variants.wholeTbl,
      rowBand,
      colBand,
      isFirstRow ? style.variants.firstRow : undefined,
      isLastRow ? style.variants.lastRow : undefined,
      isFirstCol ? style.variants.firstCol : undefined,
      isLastCol ? style.variants.lastCol : undefined,
    );
  }

  function parseTableElement(
    node: Element,
    index: number,
    theme: ThemeModel,
    tableStyles?: TableStyleMap,
    relationships: Record<string, OfficeRelationship> = {},
    slideTargets?: PptxSlideTargetMap,
  ): TableElement {
    const xfrm = childByLocalName(node, 'xfrm');
    const off = childByLocalName(xfrm, 'off');
    const ext = childByLocalName(xfrm, 'ext');
    const tbl = descendantByLocalName(node, 'tbl');
    const tblPr = childByLocalName(tbl, 'tblPr');
    const styleId = textContent(childByLocalName(tblPr, 'tableStyleId')).trim();
    const tableStyle = styleId ? tableStyles?.[styleId] : undefined;
    const columnWidths = childrenByLocalName(
      childByLocalName(tbl, 'tblGrid'),
      'gridCol',
    ).map((col) => emuValue(col, 'w') ?? 0);
    const rowNodes = childrenByLocalName(tbl, 'tr');
    const rowHeights = rowNodes.map((rowNode) => emuValue(rowNode, 'h') ?? 0);
    const rows: TableCell[][] = rowNodes.map((rowNode, rowIndex) =>
      childrenByLocalName(rowNode, 'tc').map(
        (cellNode, columnIndex): TableCell => {
          const tcPr = childByLocalName(cellNode, 'tcPr');
          const fillNode =
            childByLocalName(tcPr, 'solidFill') ??
            childByLocalName(tcPr, 'gradFill');
          const { text, paragraphs, firstRunStyle } = parseTableCellText(
            cellNode,
            theme,
            relationships,
            slideTargets,
          );
          const explicitBorder = parseTableBorder(tcPr, theme);
          const styled = resolveTableCellStyle(
            tableStyle,
            tblPr,
            rowIndex,
            columnIndex,
            rowNodes.length,
            columnWidths.length,
          );
          const explicitBackgroundColor = childByLocalName(tcPr, 'noFill')
            ? null
            : parseColorNode(fillNode, theme);
          const explicitBackgroundOpacity = childByLocalName(tcPr, 'noFill')
            ? undefined
            : parseAlphaNode(fillNode);
          return {
            text,
            paragraphs,
            style: mergeTextStyles(styled.text, firstRunStyle),
            backgroundColor:
              explicitBackgroundColor !== undefined
                ? explicitBackgroundColor
                : styled.backgroundColor ?? undefined,
            backgroundOpacity:
              explicitBackgroundOpacity !== undefined
                ? explicitBackgroundOpacity
                : styled.backgroundOpacity,
            borderColor:
              explicitBorder.borderColor !== undefined
                ? explicitBorder.borderColor
                : styled.borderColor ?? undefined,
            borderOpacity:
              explicitBorder.borderOpacity !== undefined
                ? explicitBorder.borderOpacity
                : styled.borderOpacity,
            borderWidth:
              explicitBorder.borderWidth !== undefined
                ? explicitBorder.borderWidth
                : styled.borderWidth,
            margins: {
              left: emuValue(tcPr, 'marL'),
              right: emuValue(tcPr, 'marR'),
              top: emuValue(tcPr, 'marT'),
              bottom: emuValue(tcPr, 'marB'),
            },
            verticalAlign:
              attr(tcPr, 'anchor') === 'b'
                ? 'bottom'
                : attr(tcPr, 'anchor') === 'ctr'
                ? 'middle'
                : 'top',
          };
        },
      ),
    );

    return {
      id: `table-${index}`,
      type: 'table',
      x: emuValue(off, 'x') ?? 0,
      y: emuValue(off, 'y') ?? 0,
      width: emuValue(ext, 'cx') ?? 0,
      height: emuValue(ext, 'cy') ?? 0,
      columnWidths,
      rowHeights,
      rows,
    };
  }

  return parseTableElement;
}
