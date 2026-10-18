import { attr, childByLocalName, childrenByLocalName, descendantByLocalName,
  descendantsByLocalName, matchesLocalName } from '../ooxml/xml';
import { alphaToOpacity, alphaToRatio, resolveThemeColor, toHexColor, transformColor } from './colors';
import type { GradientFill, ReflectionStyle, ShadowStyle, ThemeModel } from './types';

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function colorWithOpacity(color: string, opacity?: number) {
  if (opacity === undefined || opacity >= 1) return color;
  const normalized = color.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return color;
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function readGradientFill(
  node: Element | null | undefined,
  theme: ThemeModel,
): GradientFill | undefined {
  if (!node || !matchesLocalName(node, 'gradFill')) return undefined;

  const stops = childrenByLocalName(childByLocalName(node, 'gsLst'), 'gs')
    .map((stop) => {
      const colorNode =
        childByLocalName(stop, 'srgbClr') ??
        childByLocalName(stop, 'schemeClr') ??
        childByLocalName(stop, 'sysClr') ??
        childByLocalName(stop, 'prstClr');
      const color = parseColorNode(colorNode, theme);
      if (!color) return undefined;
      return {
        offset: clamp01(Number(attr(stop, 'pos') ?? 0) / 100000),
        color: colorWithOpacity(color, parseAlphaNode(colorNode)),
      };
    })
    .filter(
      (
        stop,
      ): stop is {
        /** 在所属数据范围中的偏移位置。 */
        offset: number;
        /** 渐变色标对应的 CSS 颜色值。 */
        color: string;
      } => Boolean(stop),
    )
    .sort((a, b) => a.offset - b.offset);

  if (!stops.length) return undefined;

  return {
    type: 'linear',
    angle: Number(attr(childByLocalName(node, 'lin'), 'ang') ?? 0) / 60000,
    stops,
  };
}

function pickGradientColorNode(node: Element | null | undefined) {
  if (!node || !matchesLocalName(node, 'gradFill')) return node;
  const stops = descendantsByLocalName(node, 'gs');
  for (let index = stops.length - 1; index >= 0; index -= 1) {
    const colorNode =
      childByLocalName(stops[index], 'srgbClr') ??
      childByLocalName(stops[index], 'schemeClr') ??
      childByLocalName(stops[index], 'sysClr') ??
      childByLocalName(stops[index], 'prstClr');
    if (colorNode) return colorNode;
  }
  return node;
}

/** 读取纯色或渐变填充，供文字、形状和表格共享。 */
export function parsePaintNode(node: Element | null | undefined, theme: ThemeModel) {
  return readGradientFill(node, theme) ?? parseColorNode(node, theme);
}

/** 解析主题颜色及明暗变换，保持各类对象颜色规则一致。 */
export function parseColorNode(node: Element | null | undefined, theme: ThemeModel) {
  const sourceNode = pickGradientColorNode(node);
  if (!sourceNode) return undefined;
  const srgb = matchesLocalName(sourceNode, 'srgbClr')
    ? sourceNode
    : childByLocalName(sourceNode, 'srgbClr');
  const scheme = matchesLocalName(sourceNode, 'schemeClr')
    ? sourceNode
    : childByLocalName(sourceNode, 'schemeClr');
  const sys = matchesLocalName(sourceNode, 'sysClr')
    ? sourceNode
    : childByLocalName(sourceNode, 'sysClr');
  const prst = matchesLocalName(sourceNode, 'prstClr')
    ? sourceNode
    : childByLocalName(sourceNode, 'prstClr');
  const colorNode = srgb ?? scheme ?? sys ?? prst;
  const base =
    attr(srgb, 'val') ??
    resolveThemeColor(attr(scheme, 'val'), theme) ??
    attr(sys, 'lastClr') ??
    attr(prst, 'val');
  const transforms = descendantsByLocalName(colorNode, 'tint')
    .concat(descendantsByLocalName(colorNode, 'shade'))
    .concat(descendantsByLocalName(colorNode, 'lumMod'))
    .concat(descendantsByLocalName(colorNode, 'lumOff'))
    .map((item) => ({
      type: item.localName,
      val: Number(attr(item, 'val') ?? 0),
    }));
  const raw = transformColor(toHexColor(base), transforms);
  return raw;
}

/** 解析填充不透明度，未声明时保留默认行为。 */
export function parseAlphaNode(node: Element | null | undefined) {
  return alphaToOpacity(
    attr(descendantByLocalName(pickGradientColorNode(node), 'alpha'), 'val'),
  );
}

function parseRatioNode(node: Element | null | undefined) {
  return alphaToRatio(attr(descendantByLocalName(node, 'alpha'), 'val'));
}

/** 读取 DrawingML 阴影的颜色、透明度和方向。 */
export function parseShadowNode(
  node: Element | null,
  theme: ThemeModel,
): ShadowStyle | undefined {
  if (!node) return undefined;
  // 阴影参数位于 effectLst/effectDag 内的具体阴影节点，不能从效果容器读取。
  const shadowNode =
    (matchesLocalName(node, 'outerShdw') || matchesLocalName(node, 'innerShdw')
      ? node
      : childByLocalName(node, 'outerShdw') ??
        childByLocalName(node, 'innerShdw') ??
        descendantByLocalName(node, 'outerShdw') ??
        descendantByLocalName(node, 'innerShdw')) ?? undefined;
  if (!shadowNode) return undefined;
  const colorNode =
    childByLocalName(shadowNode, 'srgbClr') ??
    childByLocalName(shadowNode, 'schemeClr');
  const color = parseColorNode(colorNode, theme);
  const opacity = parseRatioNode(colorNode);
  const blur = attr(shadowNode, 'blurRad')
    ? Number(attr(shadowNode, 'blurRad')) / 12700
    : undefined;
  const dist = attr(shadowNode, 'dist')
    ? Number(attr(shadowNode, 'dist')) / 12700
    : undefined;
  const dir = attr(shadowNode, 'dir')
    ? (Number(attr(shadowNode, 'dir')) / 60000) * (Math.PI / 180)
    : undefined;
  return {
    color,
    opacity,
    blur,
    offsetX: dist && dir !== undefined ? Math.cos(dir) * dist : undefined,
    offsetY: dist && dir !== undefined ? Math.sin(dir) * dist : undefined,
  };
}

/** 读取 DrawingML 倒影参数，渲染层再转换为浏览器盒倒影。 */
export function parseReflectionNode(
  node: Element | null | undefined,
): ReflectionStyle | undefined {
  if (!node) return undefined;
  const reflectionNode =
    (matchesLocalName(node, 'reflection')
      ? node
      : childByLocalName(node, 'reflection') ??
        descendantByLocalName(node, 'reflection')) ?? undefined;
  if (!reflectionNode) return undefined;
  const ratio = (name: string) => {
    const value = attr(reflectionNode, name);
    if (value === undefined) return undefined;
    const parsed = Number(value) / 100000;
    return Number.isFinite(parsed) ? clamp01(parsed) : undefined;
  };
  const emu = (name: string) => {
    const value = attr(reflectionNode, name);
    if (value === undefined) return undefined;
    const parsed = Number(value) / 12700;
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const direction = attr(reflectionNode, 'dir');
  return {
    blur: emu('blurRad'),
    distance: emu('dist'),
    direction:
      direction !== undefined && Number.isFinite(Number(direction))
        ? Number(direction) / 60000
        : undefined,
    startOpacity: ratio('stA'),
    endOpacity: ratio('endA'),
    startPosition: ratio('stPos'),
    endPosition: ratio('endPos'),
  };
}

/** 解析并确定 `resolveMediaRef` 对应的引用或配置。 */
