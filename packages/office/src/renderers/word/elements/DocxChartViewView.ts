// 从原 DocxChartView 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import type { DocxChartBlock } from '../../../engine/docx/types';
import { createDom } from '../../../view/dom/createDom';
import type { WordElementContext } from '../WordElementContext';
/** DOCX 图表视图组件属性。 */
type DocxChartViewProps = {
  /** 当前负责处理或渲染的内容块。 */
  block: DocxChartBlock;
  /** 当前预览缩放比例，100 表示原始大小。 */
  zoom: number;
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createDocxChartViewView(context: WordElementContext) {
  /** 为 DOCX 图表统一获取按页快照资源，同时保留 ECharts 的卸载生命周期。 */
  function DocxChartViewComponent({ block, zoom }: DocxChartViewProps) {
    const snapshot = context.resource(block.snapshotSource);
    return createDom(context.document, context.chart, {
      chart: snapshot.url
        ? { ...block.chart, snapshotSrc: snapshot.url }
        : block.chart,
      width: block.width,
      height: block.height,
      zoom: zoom,
    });
  }
  const DocxChartView = DocxChartViewComponent;
  return DocxChartView;
}
