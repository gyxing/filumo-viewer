// 从原 OfficeAnnotationMarker 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import { createDom, type DomChild } from '../../../view/dom/createDom';
import type { WordElementContext } from '../WordElementContext';
/** 正文批注范围标记属性。 */
type OfficeAnnotationMarkerProps = {
  /** 当前范围对应的批注标识。 */
  annotationId: string;
  /** 不改变原有文本排版的行内内容。 */
  children: DomChild;
  /** 源格式已经标记为解决时降低视觉强调。 */
  resolved?: boolean;
  /** 当前 Word 投影是否显示批注标记。 */
  visible?: boolean;
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createOfficeAnnotationMarkerView(context: WordElementContext) {
  /** 渲染可选择、可导航且不会改变行高的批注范围。 */
  function OfficeAnnotationMarker({
    annotationId,
    children,
    resolved = false,
    visible = true,
  }: OfficeAnnotationMarkerProps) {
    const runtime = context.annotationRuntime;
    if (!visible || !runtime?.options.showComments)
      return createDom(context.document, null, null, children);
    const active = runtime.state.activeAnnotation?.id === annotationId;
    return createDom(
      context.document,
      'mark',
      {
        className: [
          'office-file-annotation-marker',
          active ? 'office-file-annotation-marker--active' : undefined,
          resolved ? 'office-file-annotation-marker--resolved' : undefined,
        ]
          .filter(Boolean)
          .join(' '),
        'data-office-annotation-id': annotationId,
        'data-active': active ? 'true' : 'false',
        onClick: () => void runtime.actions.selectId(annotationId),
      },
      children,
    );
  }
  return OfficeAnnotationMarker;
}
