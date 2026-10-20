import type { PdfAssetLocations } from '../assets';
import type { PdfOptions } from '../options';
/** 通过稳定的公共入口解析资源，runtime chunk 的哈希目录不参与地址计算。 */
export async function getPdfAssets(
  options: PdfOptions,
): Promise<PdfAssetLocations> {
  const { resolvePdfAssets } = await import('@fivo/pdf/assets');
  const pageBase =
    typeof document === 'undefined' ? undefined : document.baseURI;
  // 打包器可能把 import.meta.url 保留为源码 file URL；宿主配置必须基于页面解析。
  const absolute = (value?: string) =>
    value && pageBase ? new URL(value, pageBase).href : value;
  return resolvePdfAssets({
    ...options,
    assetsBaseUrl: absolute(options.assetsBaseUrl),
    workerSrc: absolute(options.workerSrc),
  });
}
