// 从原 DocImageGallery 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import type { DocImage } from '../../../engine/doc/types';
import { createDom } from '../../../view/dom/createDom';
import type { WordElementContext } from '../WordElementContext';
/** DOC图片集组件属性。 */
type DocImageGalleryProps = {
  /** 当前文档或页面包含的图片资源。 */
  images: DocImage[];
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createDocImageGalleryView(context: WordElementContext) {
  /** 渲染 DOC 文档中的独立图片集。 */
  function DocImageGalleryComponent({ images }: DocImageGalleryProps) {
    const messages = context.messages;
    if (!images.length) return null;
    return createDom(
      context.document,
      'section',
      {
        className: 'office-file-doc-image-gallery',
      },
      createDom(
        context.document,
        'strong',
        {
          className: 'office-file-doc-image-gallery__title',
        },
        messages.document.images,
      ),
      createDom(
        context.document,
        'div',
        {
          className: 'office-file-doc-image-gallery__grid',
        },
        images.map((image) =>
          createDom(
            context.document,
            'figure',
            {
              key: image.id,
              className: 'office-file-doc-image-gallery__figure',
            },
            createDom(context.document, context.previewableImage, {
              previewId: image.id,
              previewName: image.caption,
              previewMimeType: image.mimeType,
              previewSource: image.src,
              className: 'office-file-doc-image-gallery__img',
              src: image.src,
              alt: image.caption ?? image.id,
              loading: 'lazy',
              decoding: 'async',
            }),
          ),
        ),
      ),
    );
  }
  const DocImageGallery = DocImageGalleryComponent;
  return DocImageGallery;
}
