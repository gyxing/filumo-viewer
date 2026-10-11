import { updateAttributes } from './updateAttributes';
export type CSSProperties = Record<string, string | number | undefined>;
export type DomChild =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly DomChild[];
const SVG = new Set(
  'svg g path rect circle ellipse line polyline polygon defs pattern linearGradient radialGradient stop clipPath mask filter feGaussianBlur feOffset feMerge feMergeNode image text tspan textPath use symbol marker title foreignObject'.split(
    ' ',
  ),
);
const SVG_CASE = new Set(
  'viewBox preserveAspectRatio gradientUnits gradientTransform patternUnits patternContentUnits patternTransform markerWidth markerHeight markerUnits refX refY textLength lengthAdjust pathLength filterUnits primitiveUnits stdDeviation'.split(
    ' ',
  ),
);
const UNITLESS = new Set(
  'opacity zIndex flex flexGrow flexShrink order fontWeight lineHeight zoom scale fillOpacity strokeOpacity strokeWidth strokeMiterlimit strokeDashoffset columnCount gridRow gridColumn'.split(
    ' ',
  ),
);
/** 将已受控的样式对象写入真实元素，不保留虚拟节点或调度状态。 */
export function applyDomStyle(
  element: HTMLElement | SVGElement,
  style: CSSProperties,
) {
  for (const [key, value] of Object.entries(style)) {
    if (value === undefined) continue;
    const name = key.startsWith('--')
      ? key
      : key
          .replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())
          .replace(/^ms-/, '-ms-');
    element.style.setProperty(
      name,
      typeof value === 'number' &&
        value !== 0 &&
        !UNITLESS.has(key) &&
        !key.startsWith('--')
        ? value + 'px'
        : String(value),
    );
  }
}
/** 直接构造 DOM；显式传入 Document，文本不会经过 HTML 解析，不实现虚拟 DOM 或 Hook。 */
export function createDom(
  document: Document,
  tag: unknown,
  props: Record<string, unknown> | null,
  ...children: DomChild[]
): Node {
  const attributes = props ?? {};
  if (typeof tag === 'function')
    return createDom(
      document,
      null,
      null,
      (tag as (props: Record<string, unknown>) => DomChild)({
        ...attributes,
        ...(children.length
          ? { children }
          : attributes.children === undefined
          ? { children: [] }
          : {}),
      }),
    );
  const node =
    typeof tag === 'string'
      ? SVG.has(tag)
        ? document.createElementNS('http://www.w3.org/2000/svg', tag)
        : document.createElement(tag)
      : document.createDocumentFragment();
  if (node.nodeType === 1) {
    const element = node as HTMLElement | SVGElement;
    for (const [key, value] of Object.entries(attributes)) {
      if (key === 'key' || value === undefined || value === null) continue;
      if (key === 'ref') {
        if (typeof value === 'function')
          (value as (element: Element) => void)(element);
        else (value as { current: Element | null }).current = element;
        continue;
      }
      if (key === 'style') {
        applyDomStyle(element, value as CSSProperties);
        continue;
      }
      if (/^on[A-Z]/.test(key)) {
        if (typeof value === 'function') {
          const capture = key.endsWith('Capture');
          const event = key
            .slice(2, capture ? -7 : undefined)
            .toLowerCase()
            .replace('doubleclick', 'dblclick');
          element.addEventListener(event, value as EventListener, capture);
        }
        continue;
      }
      if (
        key === 'dangerouslySetInnerHTML' ||
        key === 'innerHTML' ||
        key === 'srcdoc'
      )
        throw new Error('原生文档节点禁止直接注入 HTML');
      const name =
        key === 'className'
          ? 'class'
          : key === 'htmlFor'
          ? 'for'
          : SVG.has(String(tag)) && !SVG_CASE.has(key)
          ? key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())
          : key;
      if (key.startsWith('aria-') || key.startsWith('data-'))
        element.setAttribute(name, String(value));
      else
        updateAttributes(element, {
          [name]: value as string | number | boolean,
        });
    }
  }
  const append = (child: DomChild) => {
    if (child === null || child === undefined || typeof child === 'boolean')
      return;
    if (Array.isArray(child)) {
      child.forEach(append);
      return;
    }
    if (typeof child === 'string' || typeof child === 'number') {
      node.appendChild(document.createTextNode(String(child)));
      return;
    }
    const existing = child as Node;
    node.appendChild(existing.parentNode ? existing.cloneNode(true) : existing);
  };
  children.forEach(append);
  return node;
}

export type NodeElement = Node;
export type DomMouseEvent<T extends Element = Element> =
  globalThis.MouseEvent & { currentTarget: T };
