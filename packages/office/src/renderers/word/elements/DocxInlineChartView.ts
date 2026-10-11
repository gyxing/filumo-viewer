// 从原 DocxInlineChart 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import type { DocxInline } from '../../../engine/docx/types';
import { createDom, type CSSProperties } from '../../../view/dom/createDom';
import type { WordElementContext } from '../WordElementContext';
/** DOCX行内内容图表组件属性。 */
type DocxInlineChartProps = {
  /** 当前负责渲染的行内内容模型。 */
  inline: Extract<
    DocxInline,
    {
      /** 用于区分联合类型分支的类型标识。 */
      type: 'chart';
    }
  >;
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createDocxInlineChartView(context: WordElementContext) {
  /** 渲染DOCX行内内容图表。 */
  function DocxInlineChartComponent({ inline }: DocxInlineChartProps) {
    const chart = inline.chart;
    const chartStyle: CSSProperties = (() =>
      ({
        '--office-file-docx-inline-chart-width': `${chart.width}px`,
        '--office-file-docx-inline-chart-height': `${chart.height}px`,
      } as CSSProperties))();
    return createDom(
      context.document,
      'span',
      {
        className: 'office-file-docx-inline-chart',
        style: chartStyle,
      },
      createDom(context.document, context.component('DocxChartView'), {
        block: chart,
        zoom: 100,
      }),
    );
  }
  const DocxInlineChart = DocxInlineChartComponent;
  return DocxInlineChart;
}
