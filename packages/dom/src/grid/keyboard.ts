import type { GridPoint, GridRange } from './contracts';
import { clampGridPoint } from './selection';

/** 返回只读网格导航目标；Tab 越过首尾时交还浏览器焦点导航。 */
export function gridKeyboardTarget(
  point: GridPoint,
  key: string,
  shift: boolean,
  control: boolean,
  bounds: GridRange,
  pageRows: number,
): GridPoint | undefined {
  const next = { ...point };
  if (key === 'Tab' && control) return undefined;
  if (key === 'Tab') {
    next.column += shift ? -1 : 1;
    if (next.column > bounds.endColumn) {
      next.column = bounds.startColumn;
      next.row++;
    }
    if (next.column < bounds.startColumn) {
      next.column = bounds.endColumn;
      next.row--;
    }
    if (next.row < bounds.startRow || next.row > bounds.endRow)
      return undefined;
  } else if (key === 'Home') {
    next.column = bounds.startColumn;
    if (control) next.row = bounds.startRow;
  } else if (key === 'End') {
    next.column = bounds.endColumn;
    if (control) next.row = bounds.endRow;
  } else if (control) return undefined;
  else if (key === 'ArrowUp') next.row--;
  else if (key === 'ArrowDown') next.row++;
  else if (key === 'ArrowLeft') next.column--;
  else if (key === 'ArrowRight') next.column++;
  else if (key === 'PageUp') next.row -= Math.max(1, pageRows);
  else if (key === 'PageDown') next.row += Math.max(1, pageRows);
  else return undefined;
  return clampGridPoint(next, bounds);
}
