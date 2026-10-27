export interface ArchiveAssets {
  wasmUrl: string;
}
/** 地址解析保持独立模块基准，构建器可定位包内 WASM，不访问默认 CDN。 */
export function resolveArchiveAssets(baseUrl?: string): ArchiveAssets {
  if (baseUrl) {
    const base = new URL(
      baseUrl,
      typeof document === 'undefined' ? import.meta.url : document.baseURI,
    );
    if (!['http:', 'https:', 'file:'].includes(base.protocol))
      throw new Error('归档资源基址协议无效');
    if (!base.pathname.endsWith('/')) base.pathname += '/';
    return { wasmUrl: new URL('libarchive.wasm', base).href };
  }
  return {
    wasmUrl: new URL('./generated/libarchive.wasm', import.meta.url).href,
  };
}
