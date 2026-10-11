// 从原 DocxImage 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import type { DocxImageInline } from '../../../engine/docx/types';
import { createDom, type CSSProperties } from '../../../view/dom/createDom';
import type { WordElementContext } from '../WordElementContext';
import { resolveDocxCroppedImageStyle } from '../imageEffects';
import { calculatePositionStyle } from '../positionUtils';
/** DOCX图片组件属性。 */
type DocxImageProps = {
  /** 当前负责渲染的行内内容模型。 */
  inline: DocxImageInline;
};
// 自定义变量把解析后的图片尺寸交给 Less，避免静态样式散落在 JSX 中。
/** DOCX 图片渲染样式。 */
type DocxImageStyle = CSSProperties & {
  /** 传递给样式表的形状宽度 CSS 自定义属性。 */
  '--office-file-docx-inline-image-width': string;
  /** 传递给样式表的形状高度 CSS 自定义属性。 */
  '--office-file-docx-inline-image-height': string;
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createDocxImageView(context: WordElementContext) {
  /** 渲染DOCX图片。 */
  function DocxImageComponent({ inline }: DocxImageProps) {
    const image = inline.image;
    const positionStyle = calculatePositionStyle(image.position);
    const resource = context.resource(image.src);
    const effectedResource = context.colorEffect(
      resource.url,
      image.colorChange,
    );
    const hyperlinkProps = context.linkProps({
      hyperlink: image.hyperlink,
      source: { type: 'image', id: image.id },
    });
    const imageStyle: DocxImageStyle = (() => ({
      '--office-file-docx-inline-image-width': `${image.width}px`,
      '--office-file-docx-inline-image-height': `${image.height}px`,
      ...positionStyle,
      maxWidth: image.position ? 'none' : undefined,
    }))();
    const croppedImageStyle: CSSProperties | undefined = (() =>
      image.crop ? resolveDocxCroppedImageStyle(image.crop) : undefined)();
    const previewableImage = createDom(
      context.document,
      context.previewableImage,
      {
        ...hyperlinkProps,
        className: 'office-file-docx-inline-image',
        previewId: image.id,
        previewName: image.name,
        previewSource: image.src,
        src: effectedResource.url,
        alt: image.alt ?? '',
        title: image.name,
        style: croppedImageStyle ?? imageStyle,
        loading: 'lazy',
        decoding: 'async',
        'aria-busy': resource.loading || effectedResource.loading || undefined,
        'data-resource-error':
          resource.error || effectedResource.error ? 'true' : undefined,
      },
    );
    if (!croppedImageStyle) return previewableImage;
    return createDom(
      context.document,
      'span',
      {
        className: 'office-file-docx-inline-image-crop',
        style: imageStyle,
      },
      previewableImage,
    );
  }
  const DocxImage = DocxImageComponent;
  return DocxImage;
}
