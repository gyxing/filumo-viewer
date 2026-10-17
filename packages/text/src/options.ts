import type { TextEncoding } from './reader/types';
export interface TextOptions {
  encoding?: TextEncoding;
  /** 默认隐藏行号，需要时由宿主或阅读菜单显式开启。 */
  lineNumbers?: boolean;
  wrap?: boolean;
  extensions?: readonly string[];
  worker?: 'auto' | 'always' | 'never';
  workerFactory?: () => Worker;
}
