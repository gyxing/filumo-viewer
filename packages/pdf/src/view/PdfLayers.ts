import type { PdfTextPage } from '../runtime/contracts';
/** 查找高亮使用文字源范围，旋转后的定位通过页面标准化坐标完成。 */
export function highlightPdfRange(
  page: HTMLElement,
  text: PdfTextPage,
  start: number,
  end: number,
  metrics: { width: number; height: number },
  rotation: number,
): void {
  page.querySelectorAll('.filumo-pdf-highlight').forEach((node) => node.remove());
  const layer = page.querySelector('.textLayer');
  if (layer) {
    const walker = page.ownerDocument.createTreeWalker(layer, 5),
      nodes: Array<{ node: Text; start: number; end: number }> = [];
    let offset = 0,
      node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 3) {
        const length = node.textContent?.length ?? 0;
        nodes.push({ node: node as Text, start: offset, end: offset + length });
        offset += length;
      } else if (node.nodeName === 'BR') offset++;
    }
    const first = nodes.find((item) => item.end > start),
      last = nodes.find((item) => item.end >= end);
    if (first && last && first.start <= start && last.start <= end) {
      const range = page.ownerDocument.createRange();
      range.setStart(first.node, start - first.start);
      range.setEnd(last.node, end - last.start);
      const origin = page.getBoundingClientRect();
      for (const rect of Array.from(range.getClientRects()).slice(0, 512)) {
        const mark = page.ownerDocument.createElement('div');
        mark.className = 'filumo-pdf-highlight';
        mark.style.left = rect.left - origin.left + 'px';
        mark.style.top = rect.top - origin.top + 'px';
        mark.style.width = rect.width + 'px';
        mark.style.height = rect.height + 'px';
        page.append(mark);
      }
      return;
    }
  }
  const width = page.clientWidth,
    height = page.clientHeight;
  for (const run of text.runs) {
    if (run.end <= start || run.start >= end) continue;
    const [x1, y1, x2, y2] = run.rect;
    // Backend 已转换原始 PDF 坐标，降级高亮沿用默认旋转后的页面坐标。
    let left = x1 / metrics.width,
      top = y1 / metrics.height,
      w = (x2 - x1) / metrics.width,
      h = (y2 - y1) / metrics.height;
    const angle = ((rotation % 360) + 360) % 360;
    if (angle === 90) {
      [left, top, w, h] = [1 - top - h, left, h, w];
    } else if (angle === 180) {
      left = 1 - left - w;
      top = 1 - top - h;
    } else if (angle === 270) {
      [left, top, w, h] = [top, 1 - left - w, h, w];
    }
    const mark = page.ownerDocument.createElement('div');
    mark.className = 'filumo-pdf-highlight';
    mark.style.left = left * width + 'px';
    mark.style.top = top * height + 'px';
    mark.style.width = Math.max(1, w * width) + 'px';
    mark.style.height = Math.max(1, h * height) + 'px';
    page.append(mark);
  }
}
