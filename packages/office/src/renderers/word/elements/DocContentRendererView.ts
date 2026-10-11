// 从原 DocContentRenderer 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import {
  imagesFromImageOnlyParagraph,
  isPageDrawingOnlyParagraph,
} from '../../../engine/doc/docPagination';
import type { DocBlock, DocTextStyle } from '../../../engine/doc/types';
import { createDom, type DomChild } from '../../../view/dom/createDom';
import type { WordElementContext } from '../WordElementContext';
/** DOC内容渲染器组件属性。 */
type DocContentRendererProps = {
  /** 按源文档顺序排列的内容块。 */
  blocks: DocBlock[];
  /** 可用于排版内容的宽度，单位为标准化渲染像素。 */
  contentWidth: number;
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createDocContentRendererView(context: WordElementContext) {
  function buildDocContent(blocks: DocBlock[], contentWidth: number) {
    const renderedBlocks: DomChild[] = [];
    let index = 0;
    while (index < blocks.length) {
      const currentBlock = blocks[index];
      if (isPageDrawingOnlyParagraph(currentBlock)) {
        // 页级画布由页面框架统一叠放，锚点段落本身不生成空行。
        index += 1;
        continue;
      }
      // DOC 解析出的图片经常是连续的“纯图片段落”，合并后再排版更接近 Word 的视觉结果。
      const images = imagesFromImageOnlyParagraph(currentBlock);
      if (!images.length) {
        renderedBlocks.push(
          createDom(context.document, context.component('DocBlockRenderer'), {
            key: currentBlock.id,
            block: currentBlock,
          }),
        );
        index += 1;
        continue;
      }
      const imageGroup = [...images];
      const imageAlignment =
        currentBlock.type === 'paragraph'
          ? currentBlock.style?.textAlign
          : undefined;
      const imageSpacingBefore =
        currentBlock.type === 'paragraph'
          ? currentBlock.style?.spacingBefore
          : undefined;
      let nextIndex = index + 1;
      while (nextIndex < blocks.length) {
        // 连续图片段落作为一个图片组渲染，后续根据宽度决定单列或双列。
        const nextBlock = blocks[nextIndex];
        const nextImages = imagesFromImageOnlyParagraph(nextBlock);
        if (!nextImages.length) break;
        const nextAlignment: DocTextStyle['textAlign'] =
          nextBlock.type === 'paragraph'
            ? nextBlock.style?.textAlign
            : undefined;
        if (nextAlignment !== imageAlignment) break;
        imageGroup.push(...nextImages);
        nextIndex += 1;
      }
      renderedBlocks.push(
        createDom(context.document, context.component('DocImageLayout'), {
          key: `doc-image-layout-${index}`,
          images: imageGroup,
          contentWidth: contentWidth,
          alignment: imageAlignment,
          spacingBefore: imageSpacingBefore,
        }),
      );
      index = nextIndex;
    }
    return renderedBlocks;
  }
  /** 渲染DOC内容渲染器。 */
  function DocContentRendererComponent({
    blocks,
    contentWidth,
  }: DocContentRendererProps) {
    const renderedBlocks = (() => buildDocContent(blocks, contentWidth))();
    return createDom(context.document, null, null, renderedBlocks);
  }
  const DocContentRenderer = DocContentRendererComponent;
  return DocContentRenderer;
}
