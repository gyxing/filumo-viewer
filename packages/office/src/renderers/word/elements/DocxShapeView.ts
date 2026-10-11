// 从原 DocxShape 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import type { DocxInline } from '../../../engine/docx/types';
import { createDom, type CSSProperties } from '../../../view/dom/createDom';
import type { WordElementContext } from '../WordElementContext';
import { calculatePositionStyle } from '../positionUtils';
/** DOCX形状组件属性。 */
type DocxShapeProps = {
  /** 当前负责渲染的行内内容模型。 */
  inline: Extract<
    DocxInline,
    {
      /** 用于区分联合类型分支的类型标识。 */
      type: 'shape';
    }
  >;
  /** 查找结果对应的顶层正文块标识。 */
  searchBlockId: string;
};
// 自定义变量把解析后的形状尺寸交给 Less，保持定位样式的类型约束。
/** DOCX 形状渲染样式。 */
type DocxShapeStyle = CSSProperties & {
  /** 传递给样式表的形状宽度 CSS 自定义属性。 */
  '--office-file-docx-shape-width': string;
  /** 传递给样式表的形状高度 CSS 自定义属性。 */
  '--office-file-docx-shape-height': string;
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createDocxShapeView(context: WordElementContext) {
  /** 渲染DOCX形状。 */
  function DocxShapeComponent({ inline, searchBlockId }: DocxShapeProps) {
    const shape = inline.shape;
    const positionStyle = calculatePositionStyle(shape.position);
    const hyperlinkProps = context.linkProps({
      hyperlink: shape.hyperlink,
      source: { type: 'shape', id: shape.id },
    });
    const shapeStyle: DocxShapeStyle = (() => {
      return {
        '--office-file-docx-shape-width': `${shape.width}px`,
        '--office-file-docx-shape-height': `${shape.height}px`,
        ...positionStyle,
        zIndex: positionStyle.zIndex,
        maxWidth: shape.position ? 'none' : undefined,
        margin: shape.position ? 0 : undefined,
      };
    })();
    return createDom(
      context.document,
      'span',
      {
        ...hyperlinkProps,
        className: 'office-file-docx-shape',
        style: shapeStyle,
      },
      shape.items.map((item) =>
        createDom(
          context.document,
          context.component('DocxShapeItemRenderer'),
          {
            key: item.id,
            item: item,
            searchBlockId: searchBlockId,
          },
        ),
      ),
    );
  }
  const DocxShape = DocxShapeComponent;
  return DocxShape;
}
