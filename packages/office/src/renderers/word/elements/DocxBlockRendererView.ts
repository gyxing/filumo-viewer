// 从原 DocxBlockRenderer 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import type { DocxBlock } from '../../../engine/docx/types';
import { createDom } from '../../../view/dom/createDom';
import type { WordElementContext } from '../WordElementContext';
/** DOCX内容块渲染器组件属性。 */
type DocxBlockRendererProps = {
  /** 当前负责处理或渲染的内容块。 */
  block: DocxBlock;
  /** 当前可用宽度，单位为标准化渲染像素。 */
  availableWidth?: number;
  /** 当前页面或容器允许块内容占用的最大物理宽度。 */
  maximumWidth?: number;
  /** 查找结果对应的顶层正文块标识。 */
  searchBlockId?: string;
  /** 是否忽略相邻同样式段落之间的段前距。 */
  suppressSpacingBefore?: boolean;
  /** 覆盖浏览器实际应用的段前距。 */
  spacingBefore?: number;
  /** 是否忽略相邻同样式段落之间的段后距。 */
  suppressSpacingAfter?: boolean;
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createDocxBlockRendererView(context: WordElementContext) {
  /** 渲染DOCX内容块渲染器。 */
  function DocxBlockRendererComponent({
    block,
    availableWidth,
    maximumWidth,
    searchBlockId = block.sourceBlockId ?? block.id,
    suppressSpacingBefore = false,
    suppressSpacingAfter = false,
    spacingBefore,
  }: DocxBlockRendererProps) {
    if (block.type === 'table')
      return createDom(context.document, context.component('DocxTableBlock'), {
        block: block,
        availableWidth: availableWidth,
        maximumWidth: maximumWidth,
        searchBlockId: searchBlockId,
      });
    if (block.type === 'chart')
      return createDom(context.document, context.component('DocxChartBlock'), {
        block: block,
        zoom: 100,
      });
    return createDom(context.document, context.component('DocxParagraph'), {
      block: block,
      searchBlockId: searchBlockId,
      suppressSpacingBefore: suppressSpacingBefore,
      suppressSpacingAfter: suppressSpacingAfter,
      spacingBefore: spacingBefore,
    });
  }
  const DocxBlockRenderer = DocxBlockRendererComponent;
  return DocxBlockRenderer;
}
