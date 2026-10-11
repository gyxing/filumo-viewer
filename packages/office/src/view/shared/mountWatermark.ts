import { resolveOfficeViewerWatermark } from '../../shared/watermark/resolveOfficeViewerWatermark';
import type { OfficeViewerWatermark } from '../../shared/watermark/types';
import '../../styles/watermark.less';
import { updateAttributes } from '../dom/updateAttributes';
let sequence = 0;
/** 复用原水印解析与图案尺寸规则，通过 SVG 文本节点安全构建单层图案。 */
export function mountWatermark(
  container: HTMLElement,
  initial?: OfficeViewerWatermark,
) {
  const document = container.ownerDocument,
    ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const id =
    'fivo-watermark-' + ++sequence + '-' + Math.random().toString(36).slice(2);
  svg.classList.add('office-file-watermark-layer');
  updateAttributes(svg, {
    'aria-hidden': 'true',
    focusable: 'false',
    preserveAspectRatio: 'none',
  });
  container.append(svg);
  let closed = false;
  const update = (input?: OfficeViewerWatermark) => {
    if (closed) return;
    const value = resolveOfficeViewerWatermark(input);
    svg.replaceChildren();
    if (!value) {
      svg.style.display = 'none';
      return;
    }
    svg.style.removeProperty('display');
    const width = Math.max(
      120,
      Math.max(...value.content.map((line) => Array.from(line).length), 0) *
        value.fontSize *
        0.68 +
        value.gap[0],
    );
    const height = Math.max(
      80,
      value.content.length * value.fontSize * 1.5 + value.gap[1],
    );
    const x = width / 2 + value.offset[0],
      y = height / 2 + value.offset[1];
    const defs = document.createElementNS(ns, 'defs'),
      pattern = document.createElementNS(ns, 'pattern'),
      group = document.createElementNS(ns, 'g'),
      rect = document.createElementNS(ns, 'rect');
    updateAttributes(pattern, {
      id,
      width,
      height,
      patternUnits: 'userSpaceOnUse',
    });
    updateAttributes(group, {
      transform: 'rotate(' + value.rotate + ' ' + x + ' ' + y + ')',
    });
    value.content.forEach((line, index) => {
      const text = document.createElementNS(ns, 'text');
      text.textContent = line;
      updateAttributes(text, {
        x,
        y:
          y -
          ((value.content.length - 1) * value.fontSize * 1.5) / 2 +
          index * value.fontSize * 1.5,
        fill: value.color,
        'fill-opacity': value.opacity,
        'font-family': value.fontFamily,
        'font-size': value.fontSize,
        'font-weight': value.fontWeight,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
      });
      group.append(text);
    });
    pattern.append(group);
    defs.append(pattern);
    updateAttributes(rect, {
      width: '100%',
      height: '100%',
      fill: 'url(#' + id + ')',
    });
    svg.append(defs, rect);
  };
  update(initial);
  return {
    update,
    dispose() {
      closed = true;
      svg.remove();
    },
  };
}
