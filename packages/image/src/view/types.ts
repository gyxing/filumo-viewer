import type { StylePolicy } from '@filumo/dom';
/** 图片资源只交付本次显示的地址及释放权，不暴露格式包内部资源类型。 */
export interface ImageLease {
  readonly url: string;
  release(): void | Promise<void>;
}
export interface ImageModel {
  id?: string;
  name?: string;
  mimeType?: string;
  alt?: string;
  resolve(signal: AbortSignal): Promise<ImageLease>;
  download?(signal: AbortSignal): Promise<void>;
}
export interface ImageSurfaceState {
  mode: 'fit' | 'actual' | 'percentage';
  scale: number;
  fitScale: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
  naturalWidth: number;
  naturalHeight: number;
  status: 'loading' | 'ready' | 'error';
  error?: Error;
}
export interface ImageSurfaceOptions {
  signal: AbortSignal;
  locale?: 'zh-CN' | 'en-US';
  stylePolicy?: StylePolicy;
  maxDecodedPixels?: number;
  /** 相对适应窗口的操作保留旧弹层习惯；内部 scale 始终是物理倍率。 */
  zoomReference?: 'natural' | 'relative-fit';
}
export interface ImageSurfaceHandle {
  getSnapshot(): ImageSurfaceState;
  subscribe(listener: () => void): () => void;
  setScale(scale: number): void;
  fit(): void;
  actual(): void;
  rotate(): void;
  reset(): void;
  retry(): Promise<void>;
  update(options: Pick<ImageSurfaceOptions, 'locale'>): void;
  setActive(active: boolean): void;
  dispose(): Promise<void>;
}
export interface ImageOverlayOptions extends ImageSurfaceOptions {
  trigger?: HTMLElement;
  zoomReference?: 'natural' | 'relative-fit';
}
export interface ImageOverlayHandle {
  update(options: Pick<ImageSurfaceOptions, 'locale'>): void;
  setActive(active: boolean): void;
  dispose(): Promise<void>;
}
