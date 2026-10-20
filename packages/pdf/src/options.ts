/** PDF 独立配置不暴露第三方引擎类型；预算只约束当前查看器持有的资源。 */
export interface PdfOptions {
  workerFactory?: () => Worker;
  workerSrc?: string;
  assetsBaseUrl?: string;
  renderConcurrency?: number;
  maxDpr?: number;
  maxCanvasPixels?: number;
  canvasCacheBytes?: number;
  textCacheBytes?: number;
  maxSearchMatches?: number;
  onHyperlinkActivate?: (url: string) => void;
}
export const PDF_DEFAULTS = Object.freeze({
  renderConcurrency: 2,
  maxDpr: 2,
  maxCanvasPixels: 8388608,
  canvasCacheBytes: 96 * 1024 * 1024,
  textCacheBytes: 16 * 1024 * 1024,
  maxSearchMatches: 10000,
});
