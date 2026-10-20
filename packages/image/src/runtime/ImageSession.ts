import type { ImageOptions } from '../options';
/** 原文件由会话持有；每个实际显示视图独立申请 URL。 */
export interface ImageSession {
  blob: Blob;
  name?: string;
  options: ImageOptions;
}
