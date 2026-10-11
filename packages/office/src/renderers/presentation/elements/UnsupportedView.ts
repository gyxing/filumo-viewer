// 从原 UnsupportedRenderer 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import type { UnsupportedElement } from '../../../engine/pptx/types';
import { createDom } from '../../../view/dom/createDom';
import type { PresentationElementContext } from '../PresentationElementContext';
/** 不支持渲染器组件属性。 */
type UnsupportedRendererProps = {
  /** 当前处理或渲染的演示文稿元素。 */
  element: UnsupportedElement;
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createUnsupportedView(context: PresentationElementContext) {
  /** 渲染暂不支持的幻灯片元素占位。 */
  function UnsupportedRendererComponent({ element }: UnsupportedRendererProps) {
    return createDom(
      context.document,
      'div',
      {
        style: {
          position: 'absolute',
          left: element.x,
          top: element.y,
          width: element.width,
          height: element.height,
          border: '1px dashed #d92d20',
          color: '#d92d20',
          fontSize: 12,
        },
      },
      element.reason,
    );
  }
  const UnsupportedRenderer = UnsupportedRendererComponent;
  return UnsupportedRenderer;
}
