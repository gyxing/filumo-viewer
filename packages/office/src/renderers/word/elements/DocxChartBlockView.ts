// 从原 DocxChartBlock 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import type { DocxChartBlock as DocxChartBlockModel } from '../../../engine/docx/types';
import { createDom } from '../../../view/dom/createDom';
import type { WordElementContext } from '../WordElementContext';
/** DOCX图表内容块组件属性。 */
type DocxChartBlockProps = {
  /** 当前负责处理或渲染的内容块。 */
  block: DocxChartBlockModel;
  /** 当前预览缩放比例。 */
  zoom: number;
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createDocxChartBlockView(context: WordElementContext) {
  /** 渲染DOCX图表内容块。 */
  function DocxChartBlockComponent({ block, zoom }: DocxChartBlockProps) {
    return createDom(
      context.document,
      'div',
      {
        className: 'office-file-docx-chart-block',
      },
      createDom(context.document, context.component('DocxChartView'), {
        block: block,
        zoom: zoom,
      }),
    );
  }
  const DocxChartBlock = DocxChartBlockComponent;
  return DocxChartBlock;
}
