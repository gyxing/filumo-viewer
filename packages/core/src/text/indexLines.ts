import { throwIfAborted } from '../errors';
import type { TextDocument } from './types';

/** 按原始字符偏移建立行索引，CRLF 始终只计一个换行。 */
export async function indexLines(text: string, signal: AbortSignal) {
  const starts = [0];
  const kinds = new Set<string>();
  let checkpoint = 65536;
  for (let index = 0; index < text.length; index++) {
    if (index >= checkpoint) {
      throwIfAborted(signal);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      checkpoint = index + 65536;
    }
    if (text[index] === '\r') {
      if (text[index + 1] === '\n') {
        index++;
        kinds.add('crlf');
      } else kinds.add('cr');
      starts.push(index + 1);
    } else if (text[index] === '\n') {
      kinds.add('lf');
      starts.push(index + 1);
    }
  }
  throwIfAborted(signal);
  const newline = (
    kinds.size > 1 ? 'mixed' : [...kinds][0] ?? 'none'
  ) as TextDocument['newline'];
  return { lineStarts: Uint32Array.from(starts), newline };
}

/** 将字符位置映射到零基逻辑行，避免每次查找重新扫描正文。 */
export function textLineAt(document: TextDocument, offset: number) {
  let low = 0,
    high = document.lineStarts.length;
  while (low + 1 < high) {
    const mid = (low + high) >>> 1;
    if (document.lineStarts[mid] <= offset) low = mid;
    else high = mid;
  }
  return low;
}
