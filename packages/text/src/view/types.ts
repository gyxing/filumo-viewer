import type { StylePolicy } from '@fivo/dom';
import type { TextDocument } from '../reader/types';
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
