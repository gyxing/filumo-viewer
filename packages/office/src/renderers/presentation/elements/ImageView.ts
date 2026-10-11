// 从原 ImageRenderer 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import type { ImageElement } from '../../../engine/pptx/types';
import { canPreviewPresentationImage } from '../../../engine/presentation/imagePreviewPolicy';
import { type OfficeResourceSource } from '../../../engine/resource-store/types';
import { createDom } from '../../../view/dom/createDom';
import type { PresentationElementContext } from '../PresentationElementContext';
/** 图片渲染器组件属性。 */
type ImageRendererProps = {
  /** 当前处理或渲染的演示文稿元素。 */
  element: ImageElement;
  /** 是否允许当前图片响应链接交互。 */
  interactive: boolean;
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createImageView(context: PresentationElementContext) {
  /** 渲染图片渲染器。 */
  function ImageRendererComponent({
    element,
    interactive,
  }: ImageRendererProps) {
    const hyperlinkProps = context.linkProps({
      hyperlink: element.hyperlink,
      source: { type: 'image', id: element.id },
      interactive,
    });
    const previewContext = context.imagePreview;
    const source: OfficeResourceSource = (() =>
      typeof element.src === 'string'
        ? { kind: 'url', url: element.src }
        : element.src)();
    const resource = context.resource(source);
    const previewable = canPreviewPresentationImage(element);
    const canPreview = Boolean(
      interactive &&
        previewable &&
        previewContext?.options.enabled &&
        resource.url,
    );
    const left = element.crop?.left ?? 0;
    const top = element.crop?.top ?? 0;
    const right = element.crop?.right ?? 0;
    const bottom = element.crop?.bottom ?? 0;
    const visibleWidth = Math.max(0.01, 1 - left - right);
    const visibleHeight = Math.max(0.01, 1 - top - bottom);
    return createDom(
      context.document,
      'div',
      {
        'data-office-presentation-element-id': element.id,
        style: {
          position: 'absolute',
          left: element.x,
          top: element.y,
          width: element.width,
          height: element.height,
          overflow: 'hidden',
          transform: [
            element.rotate ? `rotate(${element.rotate}deg)` : '',
            element.flipH ? 'scaleX(-1)' : '',
            element.flipV ? 'scaleY(-1)' : '',
          ]
            .filter(Boolean)
            .join(' '),
          transformOrigin: 'center center',
          pointerEvents:
            interactive && (element.hyperlink || canPreview) ? 'auto' : 'none',
        },
      },
      createDom(context.document, context.previewableImage, {
        ...hyperlinkProps,
        alt: element.alt ?? '',
        className: 'office-file-pptx-image',
        previewId: element.id,
        previewName: element.alt,
        previewMimeType:
          typeof element.src === 'string' || element.src.kind === 'url'
            ? undefined
            : element.src.mimeType,
        previewSource: source,
        previewable: interactive && previewable,
        src: resource.url,
        loading: 'lazy',
        decoding: 'async',
        style: {
          position: 'absolute',
          left: `${-(left / visibleWidth) * 100}%`,
          top: `${-(top / visibleHeight) * 100}%`,
          width: `${100 / visibleWidth}%`,
          height: `${100 / visibleHeight}%`,
          objectFit: 'fill',
          display: 'block',
        },
      }),
    );
  }
  const ImageRenderer = ImageRendererComponent;
  return ImageRenderer;
}
