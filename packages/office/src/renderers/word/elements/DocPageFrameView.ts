// 从原 DocPageFrame 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import type { DocImage, DocPage } from '../../../engine/doc/types';
import {
  createDom,
  type CSSProperties,
  type DomChild,
} from '../../../view/dom/createDom';
import type { WordElementContext } from '../WordElementContext';
/** DOC页面框架组件属性。 */
type DocPageFrameProps = {
  /** 当前关联的页面模型。 */
  page: DocPage;
  /** 当前预览缩放比例。 */
  zoom: number;
  /** 当前组件包含的子节点。 */
  children: DomChild;
  /** 显示标记时在物理页右侧预留的基础标记区宽度。 */
  markupRailWidth?: number;
  /** 当前物理页需要显示的页眉徽标。 */
  headerImage?: DocImage;
  /** 按源文档层级叠放在当前物理页上的 OfficeArt 画布。 */
  pageDrawings?: DocImage[];
  /** 当前物理页需要显示的页脚页码文本。 */
  footerText?: string;
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createDocPageFrameView(context: WordElementContext) {
  /** 渲染位于正文上方或下方的页级 OfficeArt 画布。 */
  function renderPageDrawingLayer(
    images: DocImage[],
    layer: NonNullable<DocImage['pageDrawingLayer']>,
  ) {
    const layerImages = images.filter(
      (image) => image.pageDrawingLayer === layer,
    );
    if (!layerImages.length) return null;
    const layerModifier =
      layer === 'behindText' ? 'behind-text' : 'in-front-of-text';
    return createDom(
      context.document,
      'div',
      {
        className: `office-file-doc-page-frame__drawing-layer office-file-doc-page-frame__drawing-layer--${layerModifier}`,
        'data-doc-page-drawing-layer': layer,
        'aria-hidden': 'true',
      },
      layerImages.map((image) =>
        createDom(context.document, 'img', {
          key: image.id,
          className: 'office-file-doc-page-frame__drawing-image',
          src: image.src,
          alt: '',
          loading: 'lazy',
          decoding: 'async',
        }),
      ),
    );
  }
  /** 渲染DOC页面框架。 */
  function DocPageFrameComponent({
    page,
    zoom,
    children,
    markupRailWidth = 0,
    headerImage,
    pageDrawings = [],
    footerText,
  }: DocPageFrameProps) {
    const scale = zoom / 100;
    // 外层把页面与基础标记区一起居中，内层仍按物理页尺寸裁切正文和图形。
    const shellStyle: CSSProperties = (() => ({
      width: page.width * scale + markupRailWidth,
      height: page.minHeight * scale,
    }))();
    const pageClipStyle: CSSProperties = (() => ({
      width: page.width * scale,
      height: page.minHeight * scale,
    }))();
    // article 保留原始 Word 坐标系，并通过 transform 应用预览缩放。
    const articleStyle: CSSProperties = (() => ({
      width: page.width,
      minHeight: page.minHeight,
      padding: `${page.marginTop}px ${page.marginRight}px ${page.marginBottom}px ${page.marginLeft}px`,
      transform: `scale(${scale})`,
    }))();
    return createDom(
      context.document,
      'div',
      {
        className: 'office-file-doc-page-frame',
        style: shellStyle,
        'data-office-fit-target': 'true',
        'data-office-fit-base-width': page.width,
        'data-office-fit-base-height': page.minHeight,
        'data-office-fit-fixed-width': markupRailWidth || undefined,
      },
      createDom(
        context.document,
        'div',
        {
          className: 'office-file-doc-page-frame__page-clip',
          style: pageClipStyle,
        },
        createDom(
          context.document,
          'article',
          {
            className: 'office-file-doc-page-frame__article',
            style: articleStyle,
          },
          renderPageDrawingLayer(pageDrawings, 'behindText'),
          renderPageDrawingLayer(pageDrawings, 'inFrontOfText'),
          headerImage
            ? createDom(context.document, 'img', {
                className: 'office-file-doc-page-frame__header-image',
                src: headerImage.src,
                alt: '',
                loading: 'lazy',
                decoding: 'async',
              })
            : null,
          children,
          footerText
            ? createDom(
                context.document,
                'div',
                {
                  className: 'office-file-doc-page-frame__footer',
                },
                footerText,
              )
            : null,
        ),
      ),
    );
  }
  const DocPageFrame = DocPageFrameComponent;
  return DocPageFrame;
}
