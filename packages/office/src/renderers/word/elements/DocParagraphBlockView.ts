// 从原 DocParagraphBlock 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import type {
  DocParagraphBlock as DocParagraphBlockModel,
  DocTextInline,
} from '../../../engine/doc/types';
import { createDom, type CSSProperties } from '../../../view/dom/createDom';
import type { WordElementContext } from '../WordElementContext';
import { docTextStyleToCss } from '../docRenderUtils';
/** DOC段落内容块组件属性。 */
type DocParagraphBlockProps = {
  /** 当前负责处理或渲染的内容块。 */
  block: DocParagraphBlockModel;
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createDocParagraphBlockView(context: WordElementContext) {
  /** 按目录段落最后一个制表符拆出标题和页码，并保留各自的源文字样式。 */
  function splitTableOfContentsInlines(inlines?: DocTextInline[]) {
    if (!inlines?.length) return undefined;
    let splitInlineIndex = -1;
    let splitTextIndex = -1;
    inlines.forEach((inline, inlineIndex) => {
      if (inline.type !== 'text') return;
      const textIndex = inline.text.lastIndexOf('\t');
      if (textIndex >= 0) {
        splitInlineIndex = inlineIndex;
        splitTextIndex = textIndex;
      }
    });
    if (splitInlineIndex < 0) return undefined;
    const splitInline = inlines[splitInlineIndex];
    if (splitInline.type !== 'text') return undefined;
    const left = inlines.slice(0, splitInlineIndex);
    const right = inlines.slice(splitInlineIndex + 1);
    if (splitTextIndex > 0) {
      left.push({
        ...splitInline,
        text: splitInline.text.slice(0, splitTextIndex),
      });
    }
    const pageNumber = splitInline.text.slice(splitTextIndex + 1);
    if (pageNumber) right.unshift({ ...splitInline, text: pageNumber });
    return { left, right };
  }
  /** 渲染DOC段落内容块。 */
  function DocParagraphBlockComponent({ block }: DocParagraphBlockProps) {
    const resolveFontFamily = context.services.fonts.resolveFamily;
    const searchBlockId = block.sourceBlockId ?? block.id;
    const isTitle = block.role === 'title';
    const isHeading = block.role === 'heading';
    const paragraphStyle: CSSProperties = (() => {
      const sourceStyle = docTextStyleToCss(
        block.style,
        resolveFontFamily,
        block.text,
      );
      if (block.style?.borderStyle || block.style?.borderWidth) {
        // Word 段落边框贴正文版心，左右缩进只影响边框内文字，不能再次收窄边框外框。
        sourceStyle.marginLeft = 0;
        sourceStyle.marginRight = 0;
      }
      return {
        marginBottom: isTitle ? 18 : isHeading ? 14 : 12,
        fontSize: isTitle ? 22 : isHeading ? 16 : 14,
        lineHeight: isTitle ? 1.45 : isHeading ? 1.65 : 1.8,
        fontWeight: isTitle || isHeading ? 700 : 400,
        ...sourceStyle,
      };
    })();
    const tocInlines = block.isTableOfContents
      ? splitTableOfContentsInlines(block.inlines)
      : undefined;
    return createDom(
      context.document,
      'p',
      {
        className: `office-file-doc-paragraph${
          tocInlines ? ' office-file-doc-paragraph--toc' : ''
        }`,
        style: paragraphStyle,
        'data-office-doc-estimated-height': block.estimatedHeight,
        'data-office-doc-grid':
          block.style?.useDocumentGrid === true ? 'true' : undefined,
        'data-office-doc-pagination-id': block.sourceBlockId ?? block.id,
        'data-office-doc-pagination-fragment': block.sourceBlockId
          ? 'true'
          : undefined,
        'data-office-word-outline-target':
          block.outlineLevel !== undefined ? block.id : undefined,
        'data-office-word-block-id': searchBlockId,
      },
      tocInlines
        ? createDom(
            context.document,
            null,
            null,
            createDom(
              context.document,
              'span',
              {
                className: 'office-file-doc-paragraph__toc-title',
              },
              createDom(
                context.document,
                context.component('DocInlineContent'),
                {
                  inlines: tocInlines.left,
                  fallback: '',
                  sourceId: `${block.id}-toc-left`,
                  searchBlockId: searchBlockId,
                },
              ),
            ),
            createDom(context.document, 'span', {
              className: 'office-file-doc-paragraph__toc-leader',
              'data-office-doc-tab-leader': 'dot',
              'aria-hidden': 'true',
            }),
            createDom(
              context.document,
              'span',
              {
                className: 'office-file-doc-paragraph__toc-page',
              },
              createDom(
                context.document,
                context.component('DocInlineContent'),
                {
                  inlines: tocInlines.right,
                  fallback: '',
                  sourceId: `${block.id}-toc-right`,
                  searchBlockId: searchBlockId,
                },
              ),
            ),
          )
        : createDom(context.document, context.component('DocInlineContent'), {
            inlines: block.inlines,
            fallback: block.text,
            sourceId: block.id,
            searchBlockId: searchBlockId,
            preserveBlockTypography: isTitle || isHeading,
          }),
    );
  }
  const DocParagraphBlock = DocParagraphBlockComponent;
  return DocParagraphBlock;
}
