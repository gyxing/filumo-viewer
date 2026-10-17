import { throwIfAborted } from '@fivo/core';
import type { TextEncoding } from './types';

type Encoding = Exclude<TextEncoding, 'auto'>;
interface DecodedText {
  text: string;
  encoding: Encoding;
}
// 自动识别只覆盖已支持的编码，不把 ANSI 或任意单字节编码当作通用兜底。
const ENCODINGS: readonly string[] = [
  'utf-8',
  'utf-16le',
  'utf-16be',
  'gbk',
  'gb18030',
];
const SAMPLE_BYTES = 64 * 1024;
// 零字节需明显集中在同一字节方向，避免仅因偶数长度就猜测 UTF-16。
const MIN_ZERO_RATIO = 0.3;
const MAX_OPPOSITE_ZERO_RATIO = 0.05;
// 自动模式排除控制字符密集的二进制，同时容纳日志中的少量控制字符。
const MAX_CONTROL_RATIO = 0.02;

/** 来源声明先经原生别名规范化，只允许当前阅读器支持的编码。 */
function declaredEncoding(mimeType?: string): Encoding | undefined {
  const match = mimeType?.match(
    /(?:^|;)\s*charset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;\s]*))/i,
  );
  const label = (match?.[1] ?? match?.[2] ?? match?.[3])?.trim();
  if (!label || label.length > 64) return undefined;
  try {
    const name = new TextDecoder(label).encoding;
    return ENCODINGS.includes(name) ? (name as Encoding) : undefined;
  } catch {
    return undefined;
  }
}

/** 无 BOM 时只采用明显的零字节方向，普通中文双字节数据不能据此猜成 UTF-16。 */
function inferredUtf16(bytes: Uint8Array): Encoding | undefined {
  if (bytes.length % 2 || bytes.length < 4) return undefined;
  const pairs = Math.min(bytes.length, SAMPLE_BYTES) / 2;
  let even = 0,
    odd = 0;
  for (let pair = 0; pair < pairs; pair++) {
    if (bytes[pair * 2] === 0) even++;
    if (bytes[pair * 2 + 1] === 0) odd++;
  }
  if (odd / pairs >= MIN_ZERO_RATIO && even / pairs <= MAX_OPPOSITE_ZERO_RATIO)
    return 'utf-16le';
  if (even / pairs >= MIN_ZERO_RATIO && odd / pairs <= MAX_OPPOSITE_ZERO_RATIO)
    return 'utf-16be';
  return undefined;
}

/** 严格解码成功还需排除明显二进制；长文本分段让出执行权以响应取消。 */
async function isReadable(text: string, signal: AbortSignal): Promise<boolean> {
  let controls = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code === 0) return false;
    if (
      (code < 32 && ![9, 10, 12, 13].includes(code)) ||
      (code >= 127 && code <= 159)
    )
      controls++;
    if (controls > text.length * MAX_CONTROL_RATIO) return false;
    if (index && index % SAMPLE_BYTES === 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      throwIfAborted(signal);
    }
  }
  return true;
}

/** 按手动、BOM、来源声明和内容特征选择编码，所有候选始终从原字节严格解码。 */
export async function decodeTextBytes(
  bytes: Uint8Array,
  options: {
    encoding?: TextEncoding;
    mimeType?: string;
    signal: AbortSignal;
  },
): Promise<DecodedText | undefined> {
  throwIfAborted(options.signal);
  const tried = new Set<Encoding>();
  const attempt = async (
    encoding?: Encoding,
    validate = true,
  ): Promise<DecodedText | undefined> => {
    if (!encoding || tried.has(encoding)) return undefined;
    tried.add(encoding);
    let text: string;
    try {
      text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    } catch {
      return undefined;
    }
    throwIfAborted(options.signal);
    if (validate && !(await isReadable(text, options.signal))) return undefined;
    return { text, encoding };
  };
  if (options.encoding && options.encoding !== 'auto')
    return attempt(options.encoding, false);
  // UTF-32 的前缀会与 UTF-16LE 重叠；当前不支持时保留手动选择，不能静默误读。
  if (
    (bytes[0] === 0xff &&
      bytes[1] === 0xfe &&
      bytes[2] === 0 &&
      bytes[3] === 0) ||
    (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0xfe && bytes[3] === 0xff)
  )
    return undefined;
  const bom =
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
      ? 'utf-8'
      : bytes[0] === 0xff && bytes[1] === 0xfe
      ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff
      ? 'utf-16be'
      : undefined;
  if (bom) return attempt(bom);
  for (const encoding of [
    declaredEncoding(options.mimeType),
    inferredUtf16(bytes),
    'utf-8',
    'gb18030',
  ] as const) {
    const result = await attempt(encoding);
    if (result) return result;
  }
  return undefined;
}
