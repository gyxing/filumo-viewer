/** 无名称输入只匹配明确位图/容器签名，任意 XML 不作为 SVG 自动接管。 */
export function detectImageBytes(bytes: Uint8Array): boolean {
  const ascii = (offset: number, value: string) =>
    [...value].every((v, i) => bytes[offset + i] === v.charCodeAt(0));
  return (
    [
      [137, 80, 78, 71, 13, 10, 26, 10],
      [255, 216, 255],
    ].some((head) => head.every((b, i) => bytes[i] === b)) ||
    ascii(0, 'GIF87a') ||
    ascii(0, 'GIF89a') ||
    (ascii(0, 'RIFF') && ascii(8, 'WEBP')) ||
    (bytes.length >= 26 &&
      ascii(0, 'BM') &&
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
        10,
        true,
      ) >= 14) ||
    (ascii(4, 'ftyp') && (ascii(8, 'avif') || ascii(8, 'avis')))
  );
}
