import type { TextEncoding } from '@fivo/core/text';

/** 只检查有界声明，结果不能覆盖 BOM 或来源 charset。 */
export function xmlEncodingHint(
  bytes: Uint8Array,
): Exclude<TextEncoding, 'auto'> | undefined {
  let text: string;
  let sourceEncoding: 'utf-8' | 'utf-16le' | 'utf-16be';
  try {
    sourceEncoding =
      (bytes[0] === 0xff && bytes[1] === 0xfe) ||
      (bytes[0] === 60 && bytes[1] === 0)
        ? 'utf-16le'
        : (bytes[0] === 0xfe && bytes[1] === 0xff) ||
          (bytes[0] === 0 && bytes[1] === 60)
        ? 'utf-16be'
        : 'utf-8';
    text = new TextDecoder(sourceEncoding).decode(bytes.subarray(0, 4096));
  } catch {
    return undefined;
  }
  const label = /^\s*<\?xml\s[^?]*\bencoding\s*=\s*['"]([^'"]+)['"]/i.exec(
    text,
  )?.[1];
  if (!label || label.length > 64) return undefined;
  if (/^utf-16$/i.test(label.trim()) && sourceEncoding !== 'utf-8')
    return sourceEncoding;
  try {
    const name = new TextDecoder(label).encoding;
    return ['utf-8', 'utf-16le', 'utf-16be', 'gbk', 'gb18030'].includes(name)
      ? (name as Exclude<TextEncoding, 'auto'>)
      : undefined;
  } catch {
    return undefined;
  }
}
