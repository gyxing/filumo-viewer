/** 根据旋转后的包围尺寸适应容器，小图保持原始大小。 */
export function calculateImageFitScale(
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  rotation: number,
): number {
  if (width <= 0 || height <= 0 || viewportWidth <= 0 || viewportHeight <= 0)
    return 1;
  const swapped = Math.abs(rotation % 180) === 90;
  return Math.min(
    1,
    Math.max(
      0.0001,
      Math.min(
        viewportWidth / (swapped ? height : width),
        viewportHeight / (swapped ? width : height),
      ),
    ),
  );
}
