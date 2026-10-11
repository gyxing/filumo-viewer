/** 异步 Less 编译的完成先后不应改变外部样式的层叠顺序。 */
export function serializeStyles(styles) {
  return [...styles.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, css]) => css).join('\n');
}
