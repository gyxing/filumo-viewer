// 从原 DocNoteBlock 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import type {
  DocBlock,
  DocNote,
  DocNoteReferenceInline,
  DocPage,
} from '../../../engine/doc/types';
import { createDom, type CSSProperties } from '../../../view/dom/createDom';
import type { WordElementContext } from '../WordElementContext';
/** 递归收集 DOC/WPS 页面正文中的脚注和尾注引用。 */
export function collectDocNoteReferences(blocks: readonly DocBlock[]) {
  const references: DocNoteReferenceInline[] = [];
  blocks.forEach((block) => {
    if (block.type === 'paragraph') {
      block.inlines?.forEach((inline) => {
        if (inline.type === 'note-reference') references.push(inline);
      });
    } else if (block.type === 'table') {
      block.rows.forEach((row) =>
        row.cells.forEach((cell) =>
          cell.inlines?.forEach((inline) => {
            if (inline.type === 'note-reference') references.push(inline);
          }),
        ),
      );
    } else {
      block.items.forEach((item) =>
        item.inlines?.forEach((inline) => {
          if (inline.type === 'note-reference') references.push(inline);
        }),
      );
    }
  });
  return references;
}
/** DOC/WPS 页面脚注或文档尾注属性。 */
type DocNoteBlockProps = {
  /** 当前页面需要显示的脚注或尾注。 */
  notes: readonly DocNote[];
  /** 当前页面尺寸和页边距。 */
  page: DocPage;
  /** 尾注使用文档末尾布局，脚注贴近当前页底部。 */
  endnotes?: boolean;
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createDocNoteBlockView(context: WordElementContext) {
  /** 在 DOC/WPS 页面底部或文档末尾渲染注释正文。 */
  function DocNoteBlock({ notes, page, endnotes = false }: DocNoteBlockProps) {
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
          ? 'office-file-doc-notes office-file-doc-notes--endnotes'
          : 'office-file-doc-notes office-file-doc-notes--footnotes',
        style: style,
      },
      createDom(context.document, 'span', {
        className: 'office-file-doc-notes__separator',
        'aria-hidden': 'true',
      }),
      notes.map((note) =>
        createDom(
          context.document,
          'div',
          {
            key: `${note.noteKind}-${note.noteId}`,
            className: 'office-file-doc-notes__item',
            'data-office-word-note-id': `${note.noteKind}:${note.noteId}`,
          },
          createDom(context.document, 'sup', {}, note.label),
          createDom(context.document, context.component('DocContentRenderer'), {
            blocks: note.blocks,
            contentWidth: contentWidth,
          }),
        ),
      ),
    );
  }
  return DocNoteBlock;
}
