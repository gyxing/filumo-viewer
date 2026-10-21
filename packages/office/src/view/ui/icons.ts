const paths = {
  search: 'M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0ZM15.5 15.5 21 21',
  up: 'm6 15 6-6 6 6',
  down: 'm6 9 6 6 6-6',
  right: 'm9 6 6 6-6 6',
  close: 'M6 6l12 12M6 18 18 6',
  panelLeftClose: 'M4 4h16v16H4ZM9 4v16m7-12-4 4 4 4',
  zoomIn:
    'M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0ZM15.5 15.5 21 21M7.5 10.5h6M10.5 7.5v6',
  zoomOut:
    'M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0ZM15.5 15.5 21 21M7.5 10.5h6',
  rotate: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  reset: 'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6',
  download: 'M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5',
  preview:
    'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  openLink: 'M14 3h7v7m0-7L10 14M10 5H4v15h15v-6',
  copy: 'M8 8h12v13H8ZM16 8V3H3v13h5',
};

export type OfficeUiIcon = keyof typeof paths;

/** 创建供侧栏和弹层使用的装饰图标，不注入 SVG 字符串。 */
export function createOfficeIcon(document: Document, name: OfficeUiIcon) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({
    viewBox: '0 0 24 24',
    width: '16',
    height: '16',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.8',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  }))
    svg.setAttribute(key, value);
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[name]);
  svg.append(path);
  return svg;
}

/** 图标按钮保留完整可访问名称和悬浮提示，避免用长标签挤占输入空间。 */
export function setOfficeIconButton(
  button: HTMLButtonElement,
  label: string,
  name: OfficeUiIcon,
) {
  button.classList.add('filumo-office-icon-button');
  button.setAttribute('aria-label', label);
  button.title = label;
  if (button.dataset.icon !== name) {
    const text = button.ownerDocument.createElement('span');
    text.className = 'filumo-office-icon-label';
    text.textContent = label;
    button.replaceChildren(createOfficeIcon(button.ownerDocument, name), text);
    button.dataset.icon = name;
  }
}
