import type { OfficeTheme } from '../ooxml/theme';
import { attr, childByLocalName, childrenByLocalName, textContent } from '../ooxml/xml';
import {
  mapAlignment, positiveTwipToPx, readBorder, readDocxTableBorders,
  readOnOff, readShading, readVal, resolveDocxStyle, resolveDocxTableBorders,
  resolveDocxTableCellMargins, twipToPx,
  type DocxParseContext, type ReadBlockChildrenOptions,
} from './docxParsingContext';
import type { DocxBlock, DocxInline, DocxParagraphBlock, DocxPosition,
  DocxTableBlock, DocxTableCell, DocxTableRow, DocxTextStyle } from './types';

// 百分比表宽不包含首尾默认单元格边距，Word 会把两侧各约 7px 绘制到正文边界外。
const DOCX_DEFAULT_TABLE_EDGE_OFFSET = 7;
type ParseContext = DocxParseContext;

/** 嵌套单元格仍交回统一块解析器，避免表格与段落模块循环导入。 */
export function createDocxTableParser(
  readDocxBlockChildren: (
    node: Element | null | undefined, id: string, context: ParseContext,
    options?: ReadBlockChildrenOptions,
  ) => DocxBlock[],
  containsOnlyPositionedInlines: (inlines: DocxInline[]) => boolean,
) {
  function readCellMargins(tcPr: Element | null | undefined) {
    const tcMar =
      childByLocalName(tcPr, 'tcMar') ?? childByLocalName(tcPr, 'tblCellMar');
    const readMargin = (name: string) => {
      const node = childByLocalName(tcMar, name);
      return positiveTwipToPx(attr(node, 'w:w') ?? attr(node, 'w'));
    };
    return {
      paddingTop: readMargin('top'),
      paddingRight: readMargin('right'),
      paddingBottom: readMargin('bottom'),
      paddingLeft: readMargin('left'),
    };
  }

  /** 合并 `mergeCellMargins` 接收的多份数据。 */
  function mergeCellMargins(
    base: Pick<
      DocxTableCell,
      'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft'
    >,
    next: Pick<
      DocxTableCell,
      'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft'
    >,
  ) {
    return {
      paddingTop: next.paddingTop ?? base.paddingTop,
      paddingRight: next.paddingRight ?? base.paddingRight,
      paddingBottom: next.paddingBottom ?? base.paddingBottom,
      paddingLeft: next.paddingLeft ?? base.paddingLeft,
    };
  }

  function readCellBorders(tcPr: Element | null | undefined) {
    const tcBorders = childByLocalName(tcPr, 'tcBorders');
    const top = childByLocalName(tcBorders, 'top');
    const right = childByLocalName(tcBorders, 'right');
    const bottom = childByLocalName(tcBorders, 'bottom');
    const left = childByLocalName(tcBorders, 'left');
    return {
      borderTop: readBorder(top),
      borderRight: readBorder(right),
      borderBottom: readBorder(bottom),
      borderLeft: readBorder(left),
      hasBorderTop: Boolean(top),
      hasBorderRight: Boolean(right),
      hasBorderBottom: Boolean(bottom),
      hasBorderLeft: Boolean(left),
    };
  }

  function readCellStyle(
    tcNode: Element,
    defaultMargins: Pick<
      DocxTableCell,
      'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft'
    >,
    theme: OfficeTheme,
  ): Omit<DocxTableCell, 'id' | 'blocks'> {
    const tcPr = childByLocalName(tcNode, 'tcPr');
    const gridSpan = childByLocalName(tcPr, 'gridSpan');
    const width = childByLocalName(tcPr, 'tcW');
    const vAlign =
      attr(childByLocalName(tcPr, 'vAlign'), 'w:val') ??
      attr(childByLocalName(tcPr, 'vAlign'), 'val');
    const shading = childByLocalName(tcPr, 'shd');
    const margins = mergeCellMargins(defaultMargins, readCellMargins(tcPr));
    return {
      colSpan: Number(attr(gridSpan, 'w:val') ?? attr(gridSpan, 'val') ?? 1),
      width: twipToPx(attr(width, 'w:w') ?? attr(width, 'w')),
      verticalAlign:
        vAlign === 'center' ? 'middle' : vAlign === 'bottom' ? 'bottom' : 'top',
      backgroundColor: readShading(shading, theme),
      noWrap: readOnOff(childByLocalName(tcPr, 'noWrap')),
      ...readCellBorders(tcPr),
      ...margins,
    };
  }

  function readCellVerticalMerge(tcNode: Element) {
    const tcPr = childByLocalName(tcNode, 'tcPr');
    const vMerge = childByLocalName(tcPr, 'vMerge');
    if (!vMerge) return undefined;
    const value = readVal(vMerge);
    return value === 'restart' ? 'restart' : 'continue';
  }

  function readTableRowHeightMultiplier(rowNode: Element) {
    return childrenByLocalName(rowNode, 'tc').reduce(
      (maxMultiplier, cellNode) => {
        const paragraphs = childrenByLocalName(cellNode, 'p');
        const hasPaddingParagraph =
          paragraphs.length > 1 &&
          paragraphs.some((paragraph) => !textContent(paragraph).trim());
        return hasPaddingParagraph
          ? Math.max(maxMultiplier, paragraphs.length)
          : maxMultiplier;
      },
      1,
    );
  }

  function readTableRowHeight(
    rowNode: Element,
    applyGridHeight: boolean,
  ): Pick<DocxTableRow, 'cantSplit' | 'height' | 'heightRule'> {
    const trPr = childByLocalName(rowNode, 'trPr');
    const trHeight = childByLocalName(trPr, 'trHeight');
    const height = positiveTwipToPx(
      attr(trHeight, 'w:val') ?? attr(trHeight, 'val'),
    );
    const heightRule = attr(trHeight, 'w:hRule') ?? attr(trHeight, 'hRule');
    const heightMultiplier =
      height !== undefined && height < 80
        ? readTableRowHeightMultiplier(rowNode)
        : 1;
    const lineGridMultiplier =
      applyGridHeight && heightRule === 'atLeast' ? 1.4 : 1;
    return {
      cantSplit: readOnOff(childByLocalName(trPr, 'cantSplit')) || undefined,
      // WPS 的 atLeast 行高仍会叠加正文行网格，直接作为 CSS 最小高度会让表格明显偏扁。
      height:
        height === undefined
          ? undefined
          : height * heightMultiplier * lineGridMultiplier,
      heightRule:
        heightRule === 'exact' || heightRule === 'atLeast'
          ? heightRule
          : height
          ? 'atLeast'
          : undefined,
    };
  }

  function readCellBlocks(
    cellNode: Element,
    id: string,
    context: ParseContext,
    paragraphContextStyle?: DocxTextStyle,
  ) {
    const blocks = readDocxBlockChildren(cellNode, id, context, {
      insideTable: true,
      paragraphContextStyle,
    });
    const defaultLineHeight = context.defaultLineHeight;
    const visibleParagraphs = blocks.filter(
      (block): block is DocxParagraphBlock =>
        block.type === 'paragraph' && Boolean(block.text.trim()),
    );
    if (visibleParagraphs.length <= 1 || defaultLineHeight === undefined) {
      return blocks;
    }
    // 正文多段单元格提升到正文网格；已吸附原始文档网格的紧凑代码文本保持较小行距。
    return blocks.map((block) => {
      if (block.type !== 'paragraph' || !block.text.trim()) return block;
      const fontSize = block.style?.fontSize ?? 14;
      const explicitLineHeight =
        block.lineHeight === undefined
          ? undefined
          : block.lineHeight > 4
          ? block.lineHeight
          : fontSize * block.lineHeight;
      const followsDocumentGrid =
        block.lineHeight !== undefined &&
        block.lineHeight > 4 &&
        context.documentGridLineHeight !== undefined &&
        Math.abs(block.lineHeight - context.documentGridLineHeight) < 0.5;
      const followsBodyGrid =
        explicitLineHeight === undefined || !followsDocumentGrid;
      return followsBodyGrid &&
        (explicitLineHeight === undefined ||
          explicitLineHeight < defaultLineHeight)
        ? {
            ...block,
            // 表格 flex 行盒会把绝对行高向上取整约 1px，解析阶段抵消以保持文档网格总高。
            lineHeight: Math.max(1, defaultLineHeight - 1),
          }
        : block;
    });
  }

  /** 判断单元格文本是否已由绝对文档网格行高完整约束。 */
  function usesDocumentGridCellPadding(blocks: DocxBlock[]) {
    const paragraphs = blocks.filter(
      (block): block is DocxParagraphBlock =>
        block.type === 'paragraph' && Boolean(block.text.trim()),
    );
    return (
      paragraphs.length > 0 &&
      paragraphs.every(
        (paragraph) =>
          paragraph.lineHeight !== undefined && paragraph.lineHeight > 4,
      )
    );
  }

  /** 获取 `getParagraphAnchorLineHeight` 返回的数据。 */
  function getParagraphAnchorLineHeight(block: DocxParagraphBlock) {
    const fontSize = block.style?.fontSize ?? 14;
    if (block.lineHeight === undefined) return fontSize * 1.2;
    return block.lineHeight > 4 ? block.lineHeight : fontSize * block.lineHeight;
  }

  function isPositionedOnlyParagraph(
    block: DocxBlock | undefined,
  ): block is DocxParagraphBlock {
    return Boolean(
      block?.type === 'paragraph' && containsOnlyPositionedInlines(block.inlines),
    );
  }

  function offsetTableAfterPositionedParagraph(
    table: DocxTableBlock,
    previousBlock: DocxBlock | undefined,
  ) {
    if (!isPositionedOnlyParagraph(previousBlock)) return table;
    const lineHeight = getParagraphAnchorLineHeight(previousBlock);
    if (!table.position) {
      return {
        ...table,
        // 锚点段落自身已占用一个正文行盒；流式表格应紧接该行，不能再叠加通用表格留白。
        marginTop: 0,
      };
    }
    if (table.position.relativeFromV !== 'text') return table;
    return {
      ...table,
      position: {
        ...table.position,
        top: table.position.top + lineHeight,
      },
    };
  }

  function readTableWidth(tblW: Element | null | undefined, columns: number[]) {
    const widthType = attr(tblW, 'w:type') ?? attr(tblW, 'type');
    if (widthType === 'pct' && columns.length) {
      return (
        columns.reduce((sum, width) => sum + width, 0) +
        DOCX_DEFAULT_TABLE_EDGE_OFFSET * 2
      );
    }
    return positiveTwipToPx(attr(tblW, 'w:w') ?? attr(tblW, 'w'));
  }

  /** 将输入标准化为 `normalizeTableForBlockContext` 返回的结构。 */
  function normalizeTableForBlockContext(
    table: DocxTableBlock,
    options?: ReadBlockChildrenOptions,
  ) {
    if (!options?.insideShape || !table.position) return table;
    return {
      ...table,
      // 文本框已经承载了页面锚点，内部表格再使用 tblpPr 会把页面坐标叠加一次。
      position: undefined,
      insideShape: true,
      visualOffsetTop: undefined,
    };
  }

  function readTablePosition(
    tblPr: Element | null | undefined,
  ): DocxPosition | undefined {
    const tblpPr = childByLocalName(tblPr, 'tblpPr');
    if (!tblpPr) return undefined;

    const rawLeft = twipToPx(attr(tblpPr, 'w:tblpX') ?? attr(tblpPr, 'tblpX'));
    const rawTop = twipToPx(attr(tblpPr, 'w:tblpY') ?? attr(tblpPr, 'tblpY'));
    if (rawLeft === undefined || rawTop === undefined) return undefined;

    const leftFromText =
      twipToPx(attr(tblpPr, 'w:leftFromText') ?? attr(tblpPr, 'leftFromText')) ??
      0;
    const horzAnchor = attr(tblpPr, 'w:horzAnchor') ?? attr(tblpPr, 'horzAnchor');
    const vertAnchor = attr(tblpPr, 'w:vertAnchor') ?? attr(tblpPr, 'vertAnchor');

    return {
      left: Math.round(rawLeft - leftFromText),
      top: Math.round(rawTop),
      relativeFromH:
        horzAnchor === 'page'
          ? 'margin'
          : (horzAnchor as DocxPosition['relativeFromH']),
      relativeFromV:
        vertAnchor === 'text'
          ? 'text'
          : (vertAnchor as DocxPosition['relativeFromV']),
    };
  }

  function parseTable(
    tblNode: Element,
    id: string,
    context: ParseContext,
  ): DocxTableBlock {
    const tblPr = childByLocalName(tblNode, 'tblPr');
    const tblW = childByLocalName(tblPr, 'tblW');
    const tableStyleId =
      readVal(childByLocalName(tblPr, 'tblStyle')) ??
      context.styles.defaults.tableStyleId;
    const tableParagraphStyle = resolveDocxStyle(tableStyleId, context.styles);
    const align = mapAlignment(readVal(childByLocalName(tblPr, 'jc')));
    const columns = childrenByLocalName(
      childByLocalName(tblNode, 'tblGrid'),
      'gridCol',
    )
      .map((col) => positiveTwipToPx(attr(col, 'w:w') ?? attr(col, 'w')))
      .filter((width): width is number => width !== undefined);
    const tableMargins = mergeCellMargins(
      resolveDocxTableCellMargins(tableStyleId, context.styles) ?? {},
      readCellMargins(tblPr),
    );
    const styleBorders = resolveDocxTableBorders(tableStyleId, context.styles);
    const directBorders = readDocxTableBorders(tblPr);
    const tableBorders = {
      top: directBorders.top ?? styleBorders?.top,
      right: directBorders.right ?? styleBorders?.right,
      bottom: directBorders.bottom ?? styleBorders?.bottom,
      left: directBorders.left ?? styleBorders?.left,
      insideHorizontal:
        directBorders.insideHorizontal ?? styleBorders?.insideHorizontal,
      insideVertical:
        directBorders.insideVertical ?? styleBorders?.insideVertical,
    };
    const result: DocxTableBlock = {
      id,
      type: 'table',
      width: readTableWidth(tblW, columns),
      align: align === 'center' || align === 'right' ? align : 'left',
      columns,
      position: readTablePosition(tblPr),
      rows: [],
    };

    const activeVerticalMerges = new Map<
      number,
      {
        /** 当前纵向合并链保存的表格单元格。 */
        cell: DocxTableCell;
        /** 表格单元格横向跨越的列数。 */
        colSpan: number;
      }
    >();
    result.rows = childrenByLocalName(tblNode, 'tr').map((rowNode, rowIndex) => {
      let columnIndex = 0;
      const cells: DocxTableCell[] = [];

      childrenByLocalName(rowNode, 'tc').forEach((cellNode, cellIndex) => {
        const verticalMerge = readCellVerticalMerge(cellNode);
        const cellId = `${id}-cell-${rowIndex + 1}-${cellIndex + 1}`;
        const cellStyle = readCellStyle(cellNode, tableMargins, context.theme);
        const colSpan =
          cellStyle.colSpan && cellStyle.colSpan > 1 ? cellStyle.colSpan : 1;

        if (verticalMerge === 'continue') {
          const activeMerge = activeVerticalMerges.get(columnIndex);
          if (activeMerge) {
            activeMerge.cell.rowSpan = (activeMerge.cell.rowSpan ?? 1) + 1;
            columnIndex += activeMerge.colSpan;
            return;
          }
        } else {
          activeVerticalMerges.delete(columnIndex);
        }

        const blocks = readCellBlocks(
          cellNode,
          cellId,
          context,
          tableParagraphStyle,
        );
        const gridControlsVerticalSpacing = usesDocumentGridCellPadding(blocks);
        const cell: DocxTableCell = {
          id: cellId,
          ...cellStyle,
          columnIndex,
          // 文档网格已提供完整行盒时不再叠加浏览器补偿内边距。
          paddingTop:
            gridControlsVerticalSpacing && cellStyle.paddingTop === undefined
              ? 0
              : cellStyle.paddingTop,
          paddingBottom:
            gridControlsVerticalSpacing && cellStyle.paddingBottom === undefined
              ? 0
              : cellStyle.paddingBottom,
          blocks,
        };
        cells.push(cell);

        if (verticalMerge === 'restart') {
          cell.rowSpan = 1;
          activeVerticalMerges.set(columnIndex, { cell, colSpan });
        }

        columnIndex += colSpan;
      });

      return {
        id: `${id}-row-${rowIndex + 1}`,
        ...readTableRowHeight(rowNode, context.defaultLineHeight !== undefined),
        cells,
      };
    });
    result.rows.forEach((row, rowIndex) => {
      row.cells.forEach((cell, cellIndex) => {
        const isFirstRow = rowIndex === 0;
        const isLastRow = rowIndex === result.rows.length - 1;
        const isFirstCell = cellIndex === 0;
        const isLastCell = cellIndex === row.cells.length - 1;
        if (!cell.hasBorderTop && !cell.borderTop) {
          cell.borderTop = isFirstRow
            ? tableBorders.top
            : tableBorders.insideHorizontal;
        }
        if (!cell.hasBorderBottom && !cell.borderBottom) {
          cell.borderBottom = isLastRow
            ? tableBorders.bottom
            : tableBorders.insideHorizontal;
        }
        if (!cell.hasBorderLeft && !cell.borderLeft) {
          cell.borderLeft = isFirstCell
            ? tableBorders.left
            : tableBorders.insideVertical;
        }
        if (!cell.hasBorderRight && !cell.borderRight) {
          cell.borderRight = isLastCell
            ? tableBorders.right
            : tableBorders.insideVertical;
        }
      });
    });

    return result;
  }

  return { parseTable, normalizeTableForBlockContext, offsetTableAfterPositionedParagraph };
}
