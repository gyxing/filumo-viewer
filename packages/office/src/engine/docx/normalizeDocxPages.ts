import type { DocxBlock, DocxPage, DocxPageContent, DocxPosition } from './types';

/** Word/WPS 正文单倍行距的默认行盒倍率，解析和页面归一化共用同一值。 */
export const DOCX_BODY_LINE_HEIGHT_MULTIPLIER = 4 / 3;

function isEmptySpacerParagraph(block: DocxBlock) {
  return (
    block.type === 'paragraph' &&
    !block.text &&
    !block.inlines.length &&
    !block.backgroundColor
  );
}

function hasRenderableBlockContent(block: DocxBlock) {
  if (block.type === 'paragraph')
    return Boolean(block.text || block.inlines.length);
  if (block.type === 'table')
    return block.rows.some((row) =>
      row.cells.some((cell) => cell.blocks.length),
    );
  return true;
}

function isFullPagePositionedShape(
  position: DocxPosition | undefined,
  size: {
    /** 对象宽度，单位为标准化渲染像素。 */
    width?: number;
    /** 对象高度，单位为标准化渲染像素。 */
    height?: number;
  },
  page: DocxPage,
) {
  if (!position || !size.width || !size.height) return false;
  return (
    size.width >= page.width * 0.85 && size.height >= page.minHeight * 0.75
  );
}

function blockHasFullPagePositionedShape(block: DocxBlock, page: DocxPage) {
  if (block.type === 'chart') {
    return isFullPagePositionedShape(block.position, block, page);
  }

  if (block.type !== 'paragraph') return false;

  return block.inlines.some((inline) => {
    if (inline.type === 'image')
      return isFullPagePositionedShape(
        inline.image.position,
        inline.image,
        page,
      );
    if (inline.type === 'shape')
      return isFullPagePositionedShape(
        inline.shape.position,
        inline.shape,
        page,
      );
    if (inline.type === 'chart')
      return isFullPagePositionedShape(
        inline.chart.position,
        inline.chart,
        page,
      );
    return false;
  });
}

/** 按 `splitSectionOverflowPage` 的规则拆分输入数据。 */
function splitSectionOverflowPage(
  pageContent: DocxPageContent,
): DocxPageContent[] {
  const splitPages: DocxPageContent[] = [];
  let currentBlocks: DocxBlock[] = [];
  let pendingSpacers: DocxBlock[] = [];
  let currentHasContent = false;
  let currentHasFullPageShape = false;
  let didSplit = false;

  const pushCurrentPage = () => {
    if (!currentBlocks.length) return;
    splitPages.push({
      ...pageContent,
      id: `${pageContent.id}-split-${splitPages.length + 1}`,
      blocks: currentBlocks,
    });
    currentBlocks = [];
    pendingSpacers = [];
    currentHasContent = false;
    currentHasFullPageShape = false;
  };

  pageContent.blocks.forEach((block) => {
    if (isEmptySpacerParagraph(block)) {
      pendingSpacers.push(block);
      return;
    }

    const startsWithFullPageShape = blockHasFullPagePositionedShape(
      block,
      pageContent.page,
    );
    if (
      startsWithFullPageShape &&
      currentHasFullPageShape &&
      currentHasContent &&
      pendingSpacers.length >= 2
    ) {
      // WPS 会把连续页面放在同一个 section 中，第二个整页背景通常就是新的自然分页。
      pushCurrentPage();
      didSplit = true;
    } else if (pendingSpacers.length) {
      currentBlocks.push(...pendingSpacers);
      pendingSpacers = [];
    }

    currentBlocks.push(block);
    currentHasFullPageShape =
      currentHasFullPageShape || startsWithFullPageShape;
    currentHasContent = currentHasContent || hasRenderableBlockContent(block);
  });

  if (!didSplit) return [pageContent];

  pushCurrentPage();
  return splitPages.length ? splitPages : [pageContent];
}

/** 连续大纲标题采用自然行盒，避免通用标题兼容行高在标题链中重复累计。 */
function normalizeConsecutiveHeadingLineHeights(blocks: DocxBlock[]) {
  return blocks.map((block, index) => {
    const nextBlock = blocks[index + 1];
    if (
      block.type !== 'paragraph' ||
      !block.inferredHeadingLineHeight ||
      block.outlineLevel === undefined ||
      nextBlock?.type !== 'paragraph' ||
      nextBlock.outlineLevel === undefined
    ) {
      return block;
    }
    const metricInline =
      block.inlines.find(
        (inline) =>
          inline.type === 'text' &&
          Boolean(inline.text) &&
          inline.advanceWidth === undefined,
      ) ??
      block.inlines.find(
        (inline) => inline.type === 'text' && Boolean(inline.text),
      );
    const fontSize =
      (metricInline?.type === 'text'
        ? metricInline.style?.lineBoxFontSize ?? metricInline.style?.fontSize
        : undefined) ??
      block.style?.fontSize ??
      14;
    return {
      ...block,
      lineHeight: fontSize * DOCX_BODY_LINE_HEIGHT_MULTIPLIER,
    };
  });
}

/** 归一化连续标题和物理页边界，避免浏览器对定位画布再次分页。 */
export function normalizeDocxPages(pages: DocxPageContent[]) {
  return pages
    .flatMap((pageContent) => splitSectionOverflowPage(pageContent))
    .map((pageContent, index) => ({
      ...pageContent,
      id: `docx-page-${index + 1}`,
      blocks: normalizeConsecutiveHeadingLineHeights(pageContent.blocks),
      suppressFirstBlockSpacing: index > 0 || undefined,
      // WPS 相册等模板把整页内容保存为定位画布，这类物理页不应被浏览器测量结果再次拆开。
      preservePhysicalPage:
        pageContent.blocks.some((block) =>
          blockHasFullPagePositionedShape(block, pageContent.page),
        ) || undefined,
    }));
}
