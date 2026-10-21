import type { PdfAssetLocations } from '../assets';
import type { PdfOptions } from '../options';

/** 按类别选择包内资源或宿主覆盖，包内标识由同版 Worker 资源清单解析。 */
export async function getPdfAssets(
  options: PdfOptions,
): Promise<PdfAssetLocations> {
  const { resolvePdfAssets, PDF_BUNDLED_ASSET_BASE } = await import(
    '@filumo/pdf/assets'
  );
  const assets = resolvePdfAssets(options);
  const root = (value: string) => {
    // PDF.js 直接拼接文件名，带查询的目录由包内适配 Worker 还原后读取。
    return new URL(value).search
      ? 'filumo-pdf://external/' + encodeURIComponent(value) + '/'
      : value;
  };
  const bundled = options.assetsBaseUrl === undefined;
  return {
    ...assets,
    cMap:
      bundled && options.cMapUrl === undefined
        ? PDF_BUNDLED_ASSET_BASE + 'cmaps/'
        : root(assets.cMap),
    standardFonts:
      bundled && options.standardFontDataUrl === undefined
        ? PDF_BUNDLED_ASSET_BASE + 'standard_fonts/'
        : root(assets.standardFonts),
    wasm:
      bundled && options.wasmUrl === undefined
        ? PDF_BUNDLED_ASSET_BASE + 'wasm/'
        : root(assets.wasm),
    icc:
      bundled && options.iccUrl === undefined
        ? PDF_BUNDLED_ASSET_BASE + 'iccs/'
        : root(assets.icc),
    textLayerCss: bundled
      ? PDF_BUNDLED_ASSET_BASE + 'text-layer.css'
      : assets.textLayerCss,
  };
}
