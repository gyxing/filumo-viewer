/** 读取网格容器内边距，供布局读阶段使用，避免渲染器重复解析样式。 */
export function readSpreadsheetViewportPadding(style?: CSSStyleDeclaration) {
  const value = (input?: string) => Number.parseFloat(input ?? '0') || 0;
  return {
    horizontal: value(style?.paddingLeft) + value(style?.paddingRight),
    vertical: value(style?.paddingTop) + value(style?.paddingBottom),
  };
}
