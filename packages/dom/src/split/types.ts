import type { StylePolicy } from '../contracts';
export interface SplitHandleOptions {
  first: HTMLElement;
  defaultRatio?: number;
  minFirst: number;
  minSecond: number;
  onResize(firstPixels: number, secondPixels: number): void;
  locale?: 'zh-CN' | 'en-US';
  stylePolicy?: StylePolicy;
}
