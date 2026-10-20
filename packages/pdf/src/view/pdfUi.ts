// PDF 侧栏沿用公共工具栏的线性图标规范，不依赖 Office 内部组件。
const PATHS = {
  search: 'M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0ZM15.5 15.5 21 21',
  clear: 'M6 6l12 12M6 18 18 6',
  // 查找按纵向结果定位；保留箭杆，避免小尖角在禁用态下难以辨认。
  previous: 'M12 20V4m-6 6 6-6 6 6',
  next: 'M12 4v16m-6-6 6 6 6-6',
  collapse: 'M3 3h18v18H3ZM8 3v18m7-14-4 5 4 5',
  expand: 'M3 3h18v18H3ZM8 3v18m4-14 4 5-4 5',
};

/** 创建侧栏装饰图标，完整操作名称由按钮的可访问标签提供。 */
export function pdfIcon(
  document: Document,
  name: keyof typeof PATHS,
): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
    path = document.createElementNS(svg.namespaceURI, 'path');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute(
    'stroke-width',
    name === 'previous' || name === 'next' ? '1.8' : '1.6',
  );
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  path.setAttribute('d', PATHS[name]);
  svg.append(path);
  return svg;
}
