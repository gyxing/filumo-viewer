// 从原 WordNoteBlock 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import type { DocxNote, DocxPage } from '../../../engine/docx/types';
import { createDom, type CSSProperties } from '../../../view/dom/createDom';
import type { WordElementContext } from '../WordElementContext';
export { collectDocxNoteReferences } from '../../../engine/docx/docxNoteReferences';
/** 页面脚注或文档尾注渲染属性。 */
type WordNoteBlockProps = {
  /** 当前页面需要显示的脚注或尾注。 */
  notes: readonly DocxNote[];
  /** 当前页面尺寸和页边距。 */
  page: DocxPage;
  /** 尾注使用普通文档末尾布局，脚注贴近当前页底部。 */
  endnotes?: boolean;
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createWordNoteBlockView(context: WordElementContext) {
  /** 在页面底部或文档末尾渲染脚注、尾注正文。 */
  function WordNoteBlock({
    notes,
    page,
    endnotes = false,
  }: WordNoteBlockProps) {
    if (!notes.length) return null;
    const contentWidth = page.width - page.marginLeft - page.marginRight;
    const style = endnotes
      ? undefined
      : ({
          right: page.marginRight,
          bottom: page.marginBottom,
          left: page.marginLeft,
        } as CSSProperties);
    return createDom(
      context.document,
      'section',
      {
        className: endnotes
          ? 'office-file-word-notes office-file-word-notes--endnotes'
          : 'office-file-word-notes office-file-word-notes--footnotes',
        style: style,
      },
      createDom(context.document, 'span', {
        className: 'office-file-word-notes__separator',
        'aria-hidden': 'true',
      }),
      notes.map((note) =>
        createDom(
          context.document,
          'div',
          {
            key: `${note.kind}-${note.id}`,
            className: 'office-file-word-notes__item',
            'data-office-word-note-id': `${note.kind}:${note.id}`,
          },
          createDom(context.document, 'sup', {}, note.label),
          createDom(
            context.document,
            'div',
            {
              className: 'office-file-word-notes__content',
            },
            note.blocks.map((block) =>
              createDom(
                context.document,
                context.component('DocxBlockRenderer'),
                {
                  key: block.id,
                  block: block,
                  availableWidth: contentWidth,
                  maximumWidth: page.width,
                  suppressSpacingBefore: true,
                  suppressSpacingAfter: true,
                },
              ),
            ),
          ),
        ),
      ),
    );
  }
  return WordNoteBlock;
}
