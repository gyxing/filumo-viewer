/** 把逻辑高度映射到有界滚动轨道，避免百万行缩放后超过浏览器像素上限。 */
export function csvScrollMetrics(
  rows: number,
  rowHeight: number,
  viewport: number,
) {
  const logicalHeight = rows * rowHeight,
    physicalHeight = Math.min(logicalHeight, 8000000);
  const visible = Math.max(1, viewport - rowHeight);
  const ratio = Math.max(
    1,
    (logicalHeight - visible) / Math.max(1, physicalHeight - visible),
  );
  return { logicalHeight, physicalHeight, ratio };
}
