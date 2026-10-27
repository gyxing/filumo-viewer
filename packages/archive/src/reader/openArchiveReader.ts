import type { ArchiveReader, ReaderContext } from './contracts';
/** 统一协议不强迫所有格式使用完整内存引擎，WASM 只服务对应格式。 */
export async function openArchiveReader(
  context: ReaderContext,
): Promise<ArchiveReader> {
  switch (context.format) {
    case 'zip':
      return new (await import('./zip/ZipReader')).ZipReader(context);
    case 'tar':
      return new (await import('./tar/TarReader')).TarReader(context);
    case 'gzip':
      return new (await import('./gzip/GzipReader')).GzipReader(context);
    case 'targz':
      return new (await import('./gzip/TarGzipReader')).TarGzipReader(context);
    default:
      return new (await import('./wasm/WasmArchiveReader')).WasmArchiveReader(
        context,
      );
  }
}
