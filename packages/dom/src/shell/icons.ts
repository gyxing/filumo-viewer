// 复用既有线性 SVG 的视觉规范，不为外壳引入框架或整套图标运行时。
const paths = {
  open: 'M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v2M3 7h6l2 3h11l-3 10H3L1 10h3',
  search: 'M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0ZM15.5 15.5 21 21',
  outline: 'M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01',
  review:
    'M21 14a2 2 0 0 1-2 2H8l-5 5V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2ZM7 7h10M7 11h6',
  notes: 'M5 3h14v18H5ZM8 7h8M8 11h8M8 15h5',
  zoomOut:
    'M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0ZM15.5 15.5 21 21M7.5 10.5h6',
  zoomIn:
    'M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0ZM15.5 15.5 21 21M7.5 10.5h6M10.5 7.5v6',
  previous: 'm15 18-6-6 6-6',
  next: 'm9 6 6 6-6 6',
  chevronDown: 'm6 9 6 6 6-6',
  download: 'M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5',
  fullscreen: 'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6',
  exitFullscreen: 'M9 3v6H3M21 9h-6V3M15 21v-6h6M3 15h6v6',
  more: 'M5 11v2M12 11v2M19 11v2',
  check: 'm5 12 4 4L19 6',
  document:
    'M14 2H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8ZM14 2v6h6M8 12h8M8 16h8',
  error: 'M12 3 2 21h20ZM12 9v5M12 17h.01',
  loading: 'M20 12a8 8 0 1 1-8-8',
  close: 'M6 6l12 12M6 18 18 6',
};
export type ShellIcon = keyof typeof paths;

/** 创建装饰性图标；按钮名称由可访问标签提供。 */
export function createShellIcon(document: Document, name: ShellIcon) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('fivo-icon');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[name]);
  svg.append(path);
  return svg;
}

/** 复用图标与文字节点，避免能力刷新时丢失按钮焦点。 */
export function labelShellButton(
  button: HTMLElement,
  label: string,
  icon?: ShellIcon,
  iconOnly = false,
) {
  button.setAttribute('aria-label', label);
  button.title = label;
  button.classList.toggle('fivo-icon-button', iconOnly);
  let text = button.querySelector<HTMLElement>('.fivo-button-label');
  if (!text) {
    text = button.ownerDocument.createElement('span');
    text.className = 'fivo-button-label';
    button.replaceChildren(text);
  }
  text.textContent = label;
  if (button.dataset.icon !== icon) {
    button.querySelector('svg')?.remove();
    if (icon) button.prepend(createShellIcon(button.ownerDocument, icon));
    button.dataset.icon = icon ?? '';
  }
}

/** 文件标识只使用名称元数据，不导入或执行任何格式插件。 */
export function updateFileIcon(host: HTMLElement, name?: string) {
  const extension = name?.split('.').at(-1)?.toLowerCase() ?? '';
  host.dataset.extension = extension;
  if (host.dataset.name === (name ?? '')) return;
  host.dataset.name = name ?? '';
  const svg = createShellIcon(host.ownerDocument, 'document');
  host.replaceChildren(svg);
  if (/^(docx?|xlsx?|pptx?|pdf)$/.test(extension)) {
    const badge = host.ownerDocument.createElement('span');
    badge.textContent = extension.startsWith('doc')
      ? 'W'
      : extension.startsWith('xls')
      ? 'X'
      : extension.startsWith('ppt')
      ? 'P'
      : 'PDF';
    host.append(badge);
  }
}
