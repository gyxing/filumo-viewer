// 从原 DocInlineContent 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import type {
  DocBookmarkInline,
  DocImageInline,
  DocNoteReferenceInline,
  DocTextInline,
  DocTextRunInline,
} from '../../../engine/doc/types';
import type { OfficeFontFamilyResolver } from '../../../engine/fonts/types';
import { createDom, type DomMouseEvent } from '../../../view/dom/createDom';
import type { WordElementContext } from '../WordElementContext';
import { inlineStyleToCss } from '../docRenderUtils';
/** DOC 行内内容组件属性。 */
type DocInlineContentProps = {
  /** 按源文档顺序排列的行内内容。 */
  inlines?: DocTextInline[];
  /** 没有可渲染行内节点时显示的回退文本。 */
  fallback: string;
  /** 是否保留块级模型自身的字体与段落样式。 */
  preserveBlockTypography?: boolean;
  /** 是否使用 Word 表格的数字分隔符换行规则。 */
  wordTableLineBreaks?: boolean;
  /** 行内内容所属块或单元格的稳定标识。 */
  sourceId?: string;
  /** 查找结果对应的顶层正文块标识。 */
  searchBlockId?: string;
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createDocInlineContentView(context: WordElementContext) {
  /** 恢复 Word 表格中斜杠与后续数字不拆行的排版语义。 */
  function withWordTableLineBreaks(text: string) {
    return text.replace(/\/(?=\d)/g, '\u200b/\u2060');
  }
  /** 渲染一个可选链接的 DOC 文字片段。 */
  function DocTextRunContent({
    inline,
    sourceId,
    searchBlockId,
    preserveBlockTypography,
    wordTableLineBreaks,
    resolveFontFamily,
  }: {
    /** 当前文字片段。 */
    inline: DocTextRunInline;
    /** 当前片段的稳定标识。 */
    sourceId: string;
    /** 查找结果对应的顶层正文块标识。 */
    searchBlockId: string;
    /** 是否保留块级字体样式。 */
    preserveBlockTypography?: boolean;
    /** 是否应用表格数字分隔符规则。 */
    wordTableLineBreaks?: boolean;
    /** 当前文档会话统一的字体链解析函数。 */
    resolveFontFamily: OfficeFontFamilyResolver;
  }) {
    const revisionMode = context.revisionMode;
    const hyperlinkProps = context.linkProps({
      hyperlink: inline.hyperlink,
      source: { type: 'text', id: sourceId },
    });
    let content = createDom(
      context.document,
      'span',
      {
        ...hyperlinkProps,
        style: inlineStyleToCss(
          inline.style,
          { preserveBlockTypography, text: inline.text },
          resolveFontFamily,
        ),
      },
      createDom(context.document, context.highlight, {
        text: inline.text,
        target: { kind: 'word', blockId: searchBlockId },
        renderText: wordTableLineBreaks ? withWordTableLineBreaks : undefined,
      }),
    );
    content = createDom(
      context.document,
      context.component('WordRevisionText'),
      {
        review: inline.review,
      },
      content,
    );
    const annotationIds = inline.review?.annotationIds ?? [];
    for (let index = annotationIds.length - 1; index >= 0; index -= 1) {
      content = createDom(
        context.document,
        context.component('OfficeAnnotationMarker'),
        {
          annotationId: annotationIds[index],
          visible: revisionMode === 'markup',
        },
        content,
      );
    }
    return content;
  }
  /** 渲染一个可选链接且仍可双击预览的 DOC 图片片段。 */
  function DocImageInlineContent({
    inline,
    sourceId,
  }: {
    /** 当前图片片段。 */
    inline: DocImageInline;
    /** 当前片段的稳定标识。 */
    sourceId: string;
  }) {
    const hyperlinkProps = context.linkProps({
      hyperlink: inline.image.hyperlink,
      source: { type: 'image', id: sourceId },
    });
    if (inline.image.pageDrawingLayer) return null;
    return createDom(
      context.document,
      'span',
      {
        className: 'office-file-doc-inline-image',
      },
      createDom(context.document, context.previewableImage, {
        ...hyperlinkProps,
        previewId: inline.image.id,
        previewName: inline.image.caption,
        previewMimeType: inline.image.mimeType,
        previewSource: inline.image.src,
        className: 'office-file-doc-inline-image__img',
        src: inline.image.src,
        alt: inline.image.caption ?? inline.image.id,
        loading: 'lazy',
        decoding: 'async',
        style: {
          width:
            inline.image.width && inline.image.width <= 520
              ? inline.image.width
              : undefined,
          height:
            inline.image.height &&
            inline.image.width &&
            inline.image.width <= 520
              ? inline.image.height
              : undefined,
        },
      }),
    );
  }
  /** 渲染 DOC/WPS 内部跳转使用的零宽书签标记。 */
  function DocBookmarkInlineContent({ inline }: { inline: DocBookmarkInline }) {
    return createDom(context.document, 'span', {
      className: 'office-file-word-bookmark',
      'data-office-word-bookmark': inline.name,
      'data-office-word-bookmark-id': inline.markerId,
      'aria-hidden': 'true',
    });
  }
  /** 渲染 DOC/WPS 脚注或尾注的可交互上标引用。 */
  function DocNoteReferenceInlineContent({
    inline,
  }: {
    /** 当前注释引用。 */
    inline: DocNoteReferenceInline;
  }) {
    const targetId = `${inline.noteKind}:${inline.noteId}`;
    return createDom(
      context.document,
      'sup',
      {
        className: 'office-file-doc-note-reference',
      },
      createDom(
        context.document,
        'button',
        {
          type: 'button',
          'data-office-word-note-reference': targetId,
          onClick: (event: DomMouseEvent<HTMLElement>) => {
            const viewer = event.currentTarget.closest(
              '.office-file-doc-viewer',
            );
            const target = Array.from(
              viewer?.querySelectorAll<HTMLElement>(
                '[data-office-word-note-id]',
              ) ?? [],
            ).find((element) => element.dataset.officeWordNoteId === targetId);
            target?.scrollIntoView({
              block: 'center',
              behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')
                .matches
                ? 'auto'
                : 'smooth',
            });
          },
        },
        inline.label,
      ),
    );
  }
  /** 渲染 DOC 段落中的行内文字和图片。 */
  function DocInlineContentComponent({
    inlines,
    fallback,
    preserveBlockTypography,
    wordTableLineBreaks,
    sourceId = 'doc-inline',
    searchBlockId = sourceId,
  }: DocInlineContentProps) {
    const resolveFontFamily = context.services.fonts.resolveFamily;
    if (!inlines?.length) {
      return createDom(context.document, context.highlight, {
        text: fallback,
        target: { kind: 'word', blockId: searchBlockId },
        renderText: wordTableLineBreaks ? withWordTableLineBreaks : undefined,
      });
    }
    return createDom(
      context.document,
      null,
      null,
      inlines.map((inline, index) =>
        inline.type === 'image'
          ? createDom(context.document, DocImageInlineContent, {
              key: `${inline.image.id}-${index}`,
              inline: inline,
              sourceId: `${sourceId}-image-${inline.image.id}`,
            })
          : inline.type === 'bookmark'
          ? createDom(context.document, DocBookmarkInlineContent, {
              key: `${inline.markerId}-${index}`,
              inline: inline,
            })
          : inline.type === 'note-reference'
          ? createDom(context.document, DocNoteReferenceInlineContent, {
              key: `${inline.noteKind}-${inline.noteId}-${index}`,
              inline: inline,
            })
          : createDom(context.document, DocTextRunContent, {
              key: `${inline.text}-${index}`,
              inline: inline,
              sourceId: `${sourceId}-text-${index}`,
              searchBlockId: searchBlockId,
              preserveBlockTypography: preserveBlockTypography,
              wordTableLineBreaks: wordTableLineBreaks,
              resolveFontFamily: resolveFontFamily,
            }),
      ),
    );
  }
  const DocInlineContent = DocInlineContentComponent;
  return DocInlineContent;
}
