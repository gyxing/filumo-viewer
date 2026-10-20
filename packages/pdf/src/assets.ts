/** 稳定资产入口不得合并进哈希 chunk，所有相对 URL 都以本文件为基准。 */
export interface PdfAssetLocations {
  display: string;
  worker: string;
  cMap: string;
  standardFonts: string;
  wasm: string;
  icc: string;
  textLayerCss: string;
}
/** 返回默认本地发行资源，不进行网络请求，宿主可覆盖资产根目录。 */
export function resolvePdfAssets(
  options: { assetsBaseUrl?: string; workerSrc?: string } = {},
  baseUrl = import.meta.url,
): PdfAssetLocations {
  const root = new URL(options.assetsBaseUrl ?? './assets/pdfjs/', baseUrl);
  if (!root.pathname.endsWith('/')) root.pathname += '/';
  return {
    display: new URL('legacy/build/pdf.mjs', root).href,
    worker: options.workerSrc
      ? new URL(options.workerSrc, baseUrl).href
      : new URL('legacy/build/pdf.worker.mjs', root).href,
    cMap: new URL('cmaps/', root).href,
    standardFonts: new URL('standard_fonts/', root).href,
    wasm: new URL('wasm/', root).href,
    icc: new URL('iccs/', root).href,
    textLayerCss: new URL('text-layer.css', root).href,
  };
}
