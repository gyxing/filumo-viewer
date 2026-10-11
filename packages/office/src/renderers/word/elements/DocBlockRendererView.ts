// 从原 DocBlockRenderer 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import type { DocBlock } from '../../../engine/doc/types';
import { createDom } from '../../../view/dom/createDom';
import type { WordElementContext } from '../WordElementContext';
/** DOC内容块渲染器组件属性。 */
type DocBlockRendererProps = {
  /** 当前负责处理或渲染的内容块。 */
  block: DocBlock;
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createDocBlockRendererView(context: WordElementContext) {
  /** 渲染DOC内容块渲染器。 */
  function DocBlockRendererComponent({ block }: DocBlockRendererProps) {
    if (block.type === 'table')
      return createDom(context.document, context.component('DocTableBlock'), {
        block: block,
      });
    if (block.type === 'list')
      return createDom(context.document, context.component('DocListBlock'), {
        block: block,
      });
    return createDom(context.document, context.component('DocParagraphBlock'), {
      block: block,
    });
  }
  const DocBlockRenderer = DocBlockRendererComponent;
  return DocBlockRenderer;
}
