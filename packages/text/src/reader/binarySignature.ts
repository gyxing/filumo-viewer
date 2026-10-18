// 使用足够明确的文件头排除非文本，不根据未知后缀或单个高位字节下结论。
const SIGNATURES: readonly (readonly number[])[] = [
  // 文档和常见归档容器。
  [0x25, 0x50, 0x44, 0x46, 0x2d], // PDF 即使只包含 ASCII 也不能按文本自动接管。
  [0x50, 0x4b, 3, 4], [0x50, 0x4b, 5, 6], [0x50, 0x4b, 7, 8],
  [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
  [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c],
  [0x52, 0x61, 0x72, 0x21, 0x1a, 7],
  [0x1f, 0x8b], [0x28, 0xb5, 0x2f, 0xfd],
  // 位图文件头；SVG 等纯文本格式仍允许作为原文展示。
  [0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10],
  [0xff, 0xd8, 0xff],
  [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
  [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  [0x49, 0x49, 0x2a, 0], [0x4d, 0x4d, 0, 0x2a],
  [0, 0, 1, 0], [0, 0, 2, 0],
  // 可执行与媒体容器。
  [0x7f, 0x45, 0x4c, 0x46],
  [0x1a, 0x45, 0xdf, 0xa3],
];

/** 识别常见文档、图片、容器和可执行文件；只用于自动兜底，不限制显式原文打开。 */
export function isBinaryDocument(bytes: Uint8Array): boolean {
  if (SIGNATURES.some((signature) => signature.every((byte, index) => bytes[index] === byte)))
    return true;
  const ascii = (offset: number, value: string) =>
    [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
  if (ascii(0, 'RIFF') && (ascii(8, 'WEBP') || ascii(8, 'WAVE') || ascii(8, 'AVI ')))
    return true;
  if (bytes.length < 16) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // BMP 与 PE 还校验结构字段，避免普通文字恰好以 BM 或 MZ 开头时被拒绝。
  if (ascii(0, 'BM') && bytes.length >= 26 && view.getUint32(10, true) >= 14 &&
      [12, 40, 52, 56, 64, 108, 124].includes(view.getUint32(14, true))) return true;
  if (ascii(0, 'MZ') && bytes.length >= 64) {
    const offset = view.getUint32(60, true);
    if (offset >= 64 && ascii(offset, 'PE\0\0')) return true;
  }
  const boxSize = view.getUint32(0);
  return ascii(4, 'ftyp') && boxSize >= 16 && boxSize <= 1024;
}
