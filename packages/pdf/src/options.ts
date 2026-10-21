/** PDF 独立配置不暴露第三方引擎类型；预算只约束当前查看器持有的资源。 */
export interface PdfOptions {
  workerFactory?: () => Worker;
  workerSrc?: string;
  /** 整套同版外部资源目录；单项地址优先于该根目录。 */
  assetsBaseUrl?: string;
  /** 压缩 CMap 目录，缺省使用包内资源。 */
  cMapUrl?: string;
  /** 标准字体目录，缺省使用包内资源。 */
  standardFontDataUrl?: string;
  /** WASM 及对应 JavaScript 回退模块所在目录。 */
  wasmUrl?: string;
  /** ICC 色彩配置目录，缺省使用包内资源。 */
  iccUrl?: string;
  /** 默认启用；关闭时仍使用可用的 JavaScript 图像解码回退。 */
  useWasm?: boolean;
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
