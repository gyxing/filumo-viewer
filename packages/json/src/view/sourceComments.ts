import { throwIfAborted } from '@filumo/core';
export interface JsonCommentRange {
  start: number;
  end: number;
}
/** 原文增强只索引注释，不构建结构树；长文档分段让出主线程。 */
export async function indexJsonComments(
  text: string,
  signal: AbortSignal,
): Promise<readonly JsonCommentRange[]> {
  const ranges: JsonCommentRange[] = [];
  let quoted = false,
    next = 65536;
  for (let i = 0; i < text.length; i++) {
    if (i >= next) {
      await new Promise<void>((r) => setTimeout(r, 0));
      throwIfAborted(signal);
      next = i + 65536;
    }
    if (quoted) {
      if (text[i] === '\\') i++;
      else if (text[i] === '"') quoted = false;
      continue;
    }
    if (text[i] === '"') {
      quoted = true;
      continue;
    }
    if (text[i] !== '/' || !['/', '*'].includes(text[i + 1])) continue;
    const start = i,
      block = text[i + 1] === '*';
    i += 2;
    while (
      i < text.length &&
      (block
        ? !(text[i] === '*' && text[i + 1] === '/')
        : !/[\r\n]/.test(text[i]))
    ) {
      i++;
      if (i >= next) {
        await new Promise<void>((r) => setTimeout(r, 0));
        throwIfAborted(signal);
        next = i + 65536;
      }
    }
    const end = block ? Math.min(text.length, i + 2) : i;
    if (ranges.length >= 200000) return [];
    ranges.push({ start, end });
    i = end - 1;
  }
  throwIfAborted(signal);
  return ranges;
}
