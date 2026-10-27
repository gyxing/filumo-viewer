import type { ArchiveFormat } from './contracts';
// 专用容器文档不在本表，不能仅凭 ZIP 签名抢走 Office 格式。
export const archiveExtensions = [
  '.zip',
  '.jar',
  '.war',
  '.ear',
  '.apk',
  '.aab',
  '.cbz',
  '.kmz',
  '.tar',
  '.gz',
  '.gzip',
  '.tgz',
  '.rar',
  '.7z',
  '.tar.xz',
  '.txz',
];
/** 组合后缀保留 TAR 身份；未开放的单文件 XZ 不进入解压分支。 */
export function archiveFormatForName(name?: string): ArchiveFormat | undefined {
  const value = name?.toLowerCase() ?? '';
  if (/\.(?:tar\.gz|tgz)$/.test(value)) return 'targz';
  if (/\.(?:tar\.xz|txz)$/.test(value)) return 'tarxz';
  if (/\.(?:zip|jar|war|ear|apk|aab|cbz|kmz)$/.test(value)) return 'zip';
  if (/\.tar$/.test(value)) return 'tar';
  if (/\.(gz|gzip)$/.test(value)) return 'gzip';
  if (/\.rar$/.test(value)) return 'rar';
  if (/\.7z$/.test(value)) return '7z';
}
/** 签名仅作为后缀未知来源的候选，驱动仍须校验完整结构。 */
export function archiveFormatForBytes(
  bytes: Uint8Array,
): ArchiveFormat | undefined {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && [3, 5, 7].includes(bytes[2]))
    return 'zip';
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return 'gzip';
  if (
    bytes[0] === 0x37 &&
    bytes[1] === 0x7a &&
    bytes[2] === 0xbc &&
    bytes[3] === 0xaf
  )
    return '7z';
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x61 &&
    bytes[2] === 0x72 &&
    bytes[3] === 0x21
  )
    return 'rar';
  if (
    bytes[0] === 0xfd &&
    bytes[1] === 0x37 &&
    bytes[2] === 0x7a &&
    bytes[3] === 0x58 &&
    bytes[4] === 0x5a
  )
    return 'tarxz';
  if (
    bytes.length >= 262 &&
    new TextDecoder().decode(bytes.slice(257, 262)) === 'ustar'
  )
    return 'tar';
}
