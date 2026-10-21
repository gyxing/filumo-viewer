import { FilumoError } from '@filumo/core';
import type { PdfOptions } from './options';

export interface PdfAssetLocations {
  display: string;
  worker: string;
  cMap: string;
  standardFonts: string;
  wasm: string;
  icc: string;
  textLayerCss: string;
}

// 只在包内 Worker 中解析的虚拟根目录，不会直接发起该协议的网络请求。
export const PDF_BUNDLED_ASSET_BASE = 'filumo-pdf://bundled/';

/** 规范化宿主明确配置的资源地址，避免相对路径落到源码 file URL。 */
function resourceUrl(
  value: string,
  field: string,
  base: string,
  directory: boolean,
): string {
  if (typeof value !== 'string' || !value.trim())
    throw new FilumoError(
      'INVALID_PDF_RESOURCE_URL',
      field + ' 必须是非空资源地址',
    );
  let url: URL;
  try {
    url = new URL(value.trim(), base);
  } catch {
    throw new FilumoError(
      'INVALID_PDF_RESOURCE_URL',
      field + ' 不是合法资源地址',
    );
  }
  if (
    !['http:', 'https:', ...(!directory ? ['blob:'] : [])].includes(
      url.protocol,
    ) ||
    url.hash
  )
    throw new FilumoError(
      'INVALID_PDF_RESOURCE_URL',
      field + ' 的协议或片段不受支持',
    );
  if (directory && !url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

/** 派生目录资源时保留宿主明确放在该目录上的查询参数。 */
function childUrl(base: string, file: string): string {
  const root = new URL(base);
  const result = new URL(file, root);
  result.search = root.search;
  return result.href;
}

/** 返回兼容的资源地址；单项目录优先，缺省不使用外部 CDN。 */
export function resolvePdfAssets(
  options: PdfOptions = {},
  baseUrl = import.meta.url,
): PdfAssetLocations {
  if (options.useWasm !== undefined && typeof options.useWasm !== 'boolean')
    throw new FilumoError('INVALID_PDF_OPTION', 'useWasm 必须是布尔值');
  if (
    options.workerFactory !== undefined &&
    typeof options.workerFactory !== 'function'
  )
    throw new FilumoError('INVALID_PDF_OPTION', 'workerFactory 必须是函数');
  const pageBase = typeof document === 'undefined' ? baseUrl : document.baseURI;
  const root =
    options.assetsBaseUrl === undefined
      ? new URL('./assets/pdfjs/', baseUrl).href
      : resourceUrl(options.assetsBaseUrl, 'assetsBaseUrl', pageBase, true);
  const directory = (
    value: string | undefined,
    field: string,
    fallback: string,
  ) =>
    value === undefined
      ? childUrl(root, fallback)
      : resourceUrl(value, field, pageBase, true);
  return {
    display: childUrl(root, 'legacy/build/pdf.mjs'),
    worker:
      options.workerSrc === undefined
        ? childUrl(root, 'legacy/build/pdf.worker.mjs')
        : resourceUrl(options.workerSrc, 'workerSrc', pageBase, false),
    cMap: directory(options.cMapUrl, 'cMapUrl', 'cmaps/'),
    standardFonts: directory(
      options.standardFontDataUrl,
      'standardFontDataUrl',
      'standard_fonts/',
    ),
    wasm: directory(options.wasmUrl, 'wasmUrl', 'wasm/'),
    icc: directory(options.iccUrl, 'iccUrl', 'iccs/'),
    textLayerCss: childUrl(root, 'text-layer.css'),
  };
}

/** 创建指定或默认的模块 Worker，默认入口保留构建器可分析的标准语法。 */
export function createPdfWorker(
  options: PdfOptions,
  assets: PdfAssetLocations,
): Worker {
  if (options.workerFactory) return options.workerFactory();
  if (options.workerSrc !== undefined || options.assetsBaseUrl !== undefined)
    return new Worker(assets.worker, { type: 'module', name: 'filumo-pdf' });
  return new Worker(new URL('./generated/worker.js', import.meta.url), {
    type: 'module',
    name: 'filumo-pdf',
  });
}

/** @internal 默认文字层样式仅在文字层首次挂载时加载。 */
export async function loadBundledPdfTextLayerCss(): Promise<string> {
  return (await import('./generated/pdf-text-layer.js')).default;
}
