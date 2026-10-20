import type { StylePolicy } from '../contracts';
import type { TextDocument } from '@fivo/core/text';
export interface TextDecoration {
  start: number;
  end: number;
  className: string;
}
export interface TextSurfaceOptions {
  locale?: 'zh-CN' | 'en-US';
  zoom?: number;
  /** 原文视图默认隐藏行号。 */
  lineNumbers?: boolean;
  wrap?: boolean;
  watermark?: string;
  stylePolicy?: StylePolicy;
  /** 只处理可见逻辑行的纯装饰，范围为原文 UTF-16 偏移。 */
  decorateLine?: (start: number, end: number) => readonly TextDecoration[];
  /** 仅在用户查找定位时通知格式层，不为普通滚动反向导航。 */
  onMatch?: (range: { start: number; end: number }) => void;
  /** 不配置时保留旧原文视图的查找语义。 */
  maxMatches?: number;
}
export interface TextSurfacePosition {
  top: number;
  left: number;
  line?: number;
  within?: number;
}
export interface TextSurfaceHandle {
  update(document: TextDocument, options: TextSurfaceOptions): void;
  setActive(active: boolean): void;
  showSearch(open: boolean): void;
  getPosition(): TextSurfacePosition;
  restorePosition(position: TextSurfacePosition): void;
  revealRange?(range: { start: number; end: number }): void;
  dispose(): void;
}
