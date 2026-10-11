// 从原 DocImageLayout 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import {
  DOC_IMAGE_ROW_GAP,
  getDocImageRenderWidth,
  imageRows,
} from '../../../engine/doc/docPagination';
import type { DocImage, DocTextStyle } from '../../../engine/doc/types';
import { createDom, type CSSProperties } from '../../../view/dom/createDom';
import type { WordElementContext } from '../WordElementContext';
/** DOC图片布局组件属性。 */
type DocImageLayoutProps = {
  /** 当前文档或页面包含的图片资源。 */
  images: DocImage[];
  /** 可用于排版内容的宽度，单位为标准化渲染像素。 */
  contentWidth: number;
  /** 图片所在源段落的水平对齐方式。 */
  alignment?: DocTextStyle['textAlign'];
  /** 图片段落前由源文档空段落或显式间距形成的留白。 */
  spacingBefore?: number;
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createDocImageLayoutView(context: WordElementContext) {
  /** 渲染DOC图片布局。 */
  function DocImageLayoutComponent({
    images,
    contentWidth,
    alignment,
    spacingBefore,
  }: DocImageLayoutProps) {
    const rows = (() => imageRows(images, contentWidth))();
    const pageCanvas = images.length === 1 ? images[0].pageInsets : undefined;
    if (!images.length) return null;
    return createDom(
      context.document,
      'div',
      {
        className: 'office-file-doc-image-layout',
        style: pageCanvas
          ? {
              marginTop: -pageCanvas.top,
              marginRight: -pageCanvas.right,
              marginBottom: -pageCanvas.bottom,
              marginLeft: -pageCanvas.left,
            }
          : { marginTop: spacingBefore },
      },
      rows.map((row) => {
        const firstImage = row[0];
        const firstAspectRatio =
          firstImage?.width && firstImage.height
            ? firstImage.width / firstImage.height
            : 0;
        const centerSingleImage =
          !pageCanvas &&
          row.length === 1 &&
          (alignment === 'center' ||
            (!alignment &&
              firstAspectRatio >= 0.75 &&
              firstAspectRatio <= 1.25));
        return createDom(
          context.document,
          'div',
          {
            key: row.map((image) => image.id).join('-'),
            className: 'office-file-doc-image-layout__row',
            style: {
              maxWidth: pageCanvas ? firstImage.width : contentWidth,
              justifyContent: pageCanvas
                ? 'flex-start'
                : alignment === 'center' || centerSingleImage
                ? 'center'
                : alignment === 'right'
                ? 'flex-end'
                : 'flex-start',
            },
          },
          row.map((image) => {
            const rowWidth = getDocImageRenderWidth(
              image,
              contentWidth,
              row.length,
            );
            const figureStyle: CSSProperties = {
              width: rowWidth,
              maxWidth: pageCanvas
                ? 'none'
                : row.length > 1
                ? `calc((100% - ${DOC_IMAGE_ROW_GAP}px) / ${row.length})`
                : '100%',
              marginInline: centerSingleImage ? 'auto' : undefined,
            };
            return createDom(
              context.document,
              'figure',
              {
                key: image.id,
                className: 'office-file-doc-image-layout__figure',
                style: figureStyle,
              },
              createDom(context.document, context.previewableImage, {
                previewId: image.id,
                previewName: image.caption,
                previewMimeType: image.mimeType,
                previewSource: image.src,
                className: 'office-file-doc-image-layout__img',
                src: image.src,
                alt: image.caption ?? image.id,
                loading: 'lazy',
                decoding: 'async',
              }),
            );
          }),
        );
      }),
    );
  }
  const DocImageLayout = DocImageLayoutComponent;
  return DocImageLayout;
}
