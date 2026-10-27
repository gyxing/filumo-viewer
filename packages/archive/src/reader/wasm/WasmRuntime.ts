import { resolveArchiveAssets } from '@filumo/archive/assets';
/** 只在 WASM 后端初始化发行引擎，入口和 ZIP 路径均不引用该模块。 */
export async function loadWasm(baseUrl?: string) {
  const { ArchiveReader, libarchiveWasm } = await import(
    '../../generated/engine.js'
  );
  const assets = resolveArchiveAssets(baseUrl);
  const module = await libarchiveWasm({
    locateFile: (file: string) =>
      file.endsWith('.wasm') ? assets.wasmUrl : file,
  });
  return { ArchiveReader, module };
}
