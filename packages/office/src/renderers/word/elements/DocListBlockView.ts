// 从原 DocListBlock 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import type { DocListBlock as DocListBlockModel } from '../../../engine/doc/types';
import { createDom, type CSSProperties } from '../../../view/dom/createDom';
import type { WordElementContext } from '../WordElementContext';
import { docTextStyleToCss } from '../docRenderUtils';
/** DOC列表内容块组件属性。 */
type DocListBlockProps = {
  /** 当前负责处理或渲染的内容块。 */
  block: DocListBlockModel;
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createDocListBlockView(context: WordElementContext) {
  /** 渲染DOC列表内容块。 */
  function DocListBlockComponent({ block }: DocListBlockProps) {
    const resolveFontFamily = context.services.fonts.resolveFamily;
    const searchBlockId = block.sourceBlockId ?? block.id;
    const { itemStyle, listStyle, markerWidth } = (() => {
      const sourceStyle = docTextStyleToCss(block.style, resolveFontFamily);
      const indentLeft = Math.max(20, block.style?.indentLeft ?? 0);
      const hangingIndent = Math.max(
        20,
        block.style?.firstLineIndent && block.style.firstLineIndent < 0
          ? -block.style.firstLineIndent
          : 0,
      );
      const markerStart = Math.max(0, indentLeft - hangingIndent);
      return {
        markerWidth: hangingIndent,
        listStyle: {
          ...sourceStyle,
          marginLeft: markerStart,
          marginBottom:
            !block.continuesOnNext && block.style?.spacingAfter === undefined
              ? 16
              : 0,
          paddingLeft: 0,
          textIndent: 0,
          listStyle: 'none',
        } satisfies CSSProperties,
        itemStyle: {
          ...sourceStyle,
          gridTemplateColumns: `${hangingIndent}px minmax(0, 1fr)`,
          marginTop: 0,
          marginRight: 0,
          marginBottom: block.style?.spacingAfter ?? 8,
          marginLeft: 0,
          padding: 0,
          textIndent: 0,
        } satisfies CSSProperties,
      };
    })();
    const Tag = block.ordered ? 'ol' : 'ul';
    return createDom(
      context.document,
      Tag,
      {
        className: 'office-file-doc-list',
        'data-office-word-block-id': searchBlockId,
        'data-office-doc-estimated-height': block.estimatedHeight,
        'data-office-doc-pagination-id': block.sourceBlockId ?? block.id,
        'data-office-doc-pagination-fragment': block.sourceBlockId
          ? 'true'
          : undefined,
        style: listStyle,
      },
      block.items.map((item, itemIndex) =>
        createDom(
          context.document,
          'li',
          {
            key: item.id,
            className: 'office-file-doc-list__item',
            style: itemStyle,
          },
          createDom(
            context.document,
            'span',
            {
              className: 'office-file-doc-list__marker',
              'aria-hidden': 'true',
              style: { width: markerWidth },
            },
            item.marker ?? (block.ordered ? `${itemIndex + 1}.` : '•'),
          ),
          createDom(
            context.document,
            'span',
            {
              className: 'office-file-doc-list__content',
            },
            createDom(context.document, context.component('DocInlineContent'), {
              inlines: item.inlines,
              fallback: item.text,
              sourceId: item.id,
              searchBlockId: searchBlockId,
            }),
          ),
        ),
      ),
    );
  }
  const DocListBlock = DocListBlockComponent;
  return DocListBlock;
}
