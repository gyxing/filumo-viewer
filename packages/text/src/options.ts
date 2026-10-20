import type { TextEncoding } from './reader/types';
export interface TextOptions {
  encoding?: TextEncoding;
  /** 默认启用：专用插件均未匹配时，仅将确认可读的未知文件作为文本预览。 */
  fallback?: boolean;
  /** 默认显示真实行号，可通过 false 或阅读菜单关闭。 */
  lineNumbers?: boolean;
  wrap?: boolean;
  extensions?: readonly string[];
  worker?: 'auto' | 'always' | 'never';
  workerFactory?: () => Worker;
}
