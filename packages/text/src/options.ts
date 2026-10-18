import type { TextEncoding } from './reader/types';
export interface TextOptions {
  encoding?: TextEncoding;
  /** 默认启用：专用插件均未匹配时，仅将确认可读的未知文件作为文本预览。 */
  fallback?: boolean;
  /** 默认隐藏行号，需要时由宿主或阅读菜单显式开启。 */
  lineNumbers?: boolean;
  wrap?: boolean;
  extensions?: readonly string[];
  worker?: 'auto' | 'always' | 'never';
  workerFactory?: () => Worker;
}
