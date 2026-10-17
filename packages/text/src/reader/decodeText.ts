import { throwIfAborted } from '@fivo/core';
import { decodeTextBytes } from './detectEncoding';
import { indexLines } from './indexLines';
import type { TextEncoding, TextReadResult } from './types';

/** 复用原字节自动识别常用编码，识别失败保持可恢复的编码选择状态。 */
export async function readText(
  bytes: Uint8Array,
  options: {
    encoding?: TextEncoding;
    /** 来源完整 MIME，可包含 charset；不声明时使用字节特征判断。 */
    mimeType?: string;
    signal: AbortSignal;
  },
): Promise<TextReadResult> {
  throwIfAborted(options.signal);
  const decoded = await decodeTextBytes(bytes, options);
  throwIfAborted(options.signal);
  if (!decoded) {
    return {
      kind: 'needs-encoding',
      reason: '无法按所选编码读取，请选择 UTF-8、UTF-16 或 GBK/GB18030。',
    };
  }
  const { text, encoding } = decoded;
  const index = await indexLines(text, options.signal);
  return { kind: 'ready', document: { text, encoding, ...index } };
}
