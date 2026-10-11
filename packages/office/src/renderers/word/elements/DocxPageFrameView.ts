// 从原 DocxPageFrame 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import type { DocxPage } from '../../../engine/docx/types';
import {
  createDom,
  type CSSProperties,
  type DomChild,
} from '../../../view/dom/createDom';
import type { WordElementContext } from '../WordElementContext';
/** DOCX页面框架组件属性。 */
type DocxPageFrameProps = {
  /** 当前关联的页面模型。 */
  page: DocxPage;
  /** 当前预览缩放比例。 */
  zoom: number;
  /** 当前组件包含的子节点。 */
  children: DomChild;
  /** 显示标记时在物理页右侧预留的基础标记区宽度。 */
  markupRailWidth?: number;
  /** 当前页面的页眉内容。 */
  header?: DomChild;
  /** 当前页面的页脚内容。 */
  footer?: DomChild;
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createDocxPageFrameView(context: WordElementContext) {
  /** 渲染DOCX页面框架。 */
  function DocxPageFrameComponent({
    page,
    zoom,
    children,
    markupRailWidth = 0,
    header,
    footer,
  }: DocxPageFrameProps) {
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
    // DOCX 的边框和页边距来自文档本身，放在 article 上才能随页面坐标系一起缩放。
    const articleStyle: CSSProperties = (() =>
      ({
        position: 'relative',
        '--office-file-docx-page-width': `${page.width}px`,
        '--office-file-docx-page-height': `${page.minHeight}px`,
        '--office-file-docx-page-margin-top': `${page.marginTop}px`,
        '--office-file-docx-page-margin-right': `${page.marginRight}px`,
        '--office-file-docx-page-margin-bottom': `${page.marginBottom}px`,
        '--office-file-docx-page-margin-left': `${page.marginLeft}px`,
        width: page.width,
        minHeight: page.minHeight,
        padding: `${page.marginTop}px ${page.marginRight}px ${page.marginBottom}px ${page.marginLeft}px`,
        borderTop: page.borderTop,
        borderRight: page.borderRight,
        borderBottom: page.borderBottom,
        borderLeft: page.borderLeft,
        transform: `scale(${scale})`,
      } as CSSProperties))();
    const regionStyle = (() => ({
      left: page.marginLeft,
      width: page.width - page.marginLeft - page.marginRight,
    }))();
    return createDom(
      context.document,
      'div',
      {
        className: 'office-file-docx-page-frame',
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
          className: 'office-file-docx-page-frame__page-clip',
          style: pageClipStyle,
        },
        createDom(
          context.document,
          'article',
          {
            className: 'office-file-docx-page-frame__article',
            style: articleStyle,
          },
          header
            ? createDom(
                context.document,
                'div',
                {
                  className: 'office-file-docx-page-frame__header',
                  style: {
                    ...regionStyle,
                    top: page.headerDistance ?? page.marginTop / 2,
                  },
                },
                header,
              )
            : null,
          children,
          footer
            ? createDom(
                context.document,
                'div',
                {
                  className: 'office-file-docx-page-frame__footer',
                  style: {
                    ...regionStyle,
                    bottom: page.footerDistance ?? page.marginBottom / 2,
                  },
                },
                footer,
              )
            : null,
        ),
      ),
    );
  }
  const DocxPageFrame = DocxPageFrameComponent;
  return DocxPageFrame;
}
