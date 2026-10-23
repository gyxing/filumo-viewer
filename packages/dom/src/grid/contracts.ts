import type { StylePolicy } from '../contracts';

export interface GridPoint {
  row: number;
  column: number;
}
export interface GridRange {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}
export interface GridRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface GridState {
  anchor?: GridPoint;
  focus?: GridPoint;
  /** 全选单独保存范围，活动单元格不必跳到末行或隐藏列。 */
  range?: GridRange;
}
/** 只提供交互需要的几何与按区读取，不引用格式解析器或完整工作簿。 */
export interface GridAdapter {
  /** 真实正文的包含式边界；空表返回 undefined，不包含视图填充区。 */
  bounds(): GridRange | undefined;
  /** 来源身份或正文变化时更新，布局重绘不能伪造内容版本。 */
  revision(): string | number;
  /** 从浏览器坐标命中源单元格；clamp 用于视口边缘拖选。 */
  hitTest(x: number, y: number, clamp: boolean): GridPoint | undefined;
  /** 返回相对视口的已裁剪矩形，冻结区域可返回多块。 */
  rects(range: GridRange): readonly GridRect[];
  reveal(point: GridPoint): void;
  readRows(
    range: GridRange,
    signal: AbortSignal,
  ): AsyncIterable<readonly string[]>;
  /** 只查询结构元数据，例如把合并区域扩展到完整矩形。 */
  normalize?(range: GridRange): GridRange;
  point?(point: GridPoint): GridPoint | undefined;
  move?(
    point: GridPoint,
    key: string,
    shift: boolean,
    control: boolean,
  ): GridPoint | undefined;
  pageRows?(): number;
  changed?(state: GridState): void;
}
export interface GridInteractionOptions {
  stylePolicy?: StylePolicy;
  locale?: 'zh-CN' | 'en-US';
  host: HTMLElement;
  adapter: GridAdapter;
  state?: GridState;
  search?(): void;
  /** 文字选择结束后允许渲染器回收此前保留的节点。 */
  onTextSelectionChange?(active: boolean): void;
  onError(error: unknown): void;
}
/** 列宽用未缩放像素保存，undefined 表示恢复源宽度。 */
export interface GridColumnResizeOptions {
  host: HTMLElement;
  scale(): number;
  width(column: number): number;
  override(column: number): number | undefined;
  change(column: number, width: number | undefined): void;
  /** 连续拖动期间允许复用布局；键盘调整仍按单次 change 处理。 */
  start?(): void;
  /** 最终值写入或原值恢复后通知，便于宿主统一计算较重的排版。 */
  end?(committed: boolean): void;
}
