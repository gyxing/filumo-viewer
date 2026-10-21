import { throwIfAborted } from '@filumo/core';
import type { TextDecoration } from '@filumo/dom/text';
import { sourceSpans } from '../parser/sourceSpans';

/** 原文着色只依赖边界扫描，不加载 SAX 或建立结构树。 */
export async function indexXmlTokens(
  text: string,
  signal: AbortSignal,
): Promise<readonly TextDecoration[]> {
  const ranges: TextDecoration[] = [];
  for await (const token of sourceSpans(text, signal, 50000)) {
    if (ranges.length > 100000) return [];
    if (token.kind === 'open' || token.kind === 'close') {
      const start = token.start + (token.kind === 'close' ? 2 : 1);
      ranges.push({
        start,
        end: start + (token.name?.length ?? 0),
        className: 'filumo-xml-tag',
      });
      for (const attr of token.attributes ?? [])
        ranges.push(
          {
            start: attr.start,
            end: attr.start + attr.name.length,
            className: 'filumo-xml-attribute',
          },
          {
            start: attr.valueStart,
            end: attr.valueEnd,
            className: 'filumo-xml-string',
          },
        );
    } else if (
      token.kind === 'comment' ||
      token.kind === 'processing' ||
      token.kind === 'cdata'
    )
      ranges.push({
        start: token.start,
        end: token.end,
        className:
          token.kind === 'cdata' ? 'filumo-xml-string' : 'filumo-xml-comment',
      });
  }
  if (ranges.length > 100000) return [];
  throwIfAborted(signal);
  return ranges.sort((a, b) => a.start - b.start);
}

/** 按可见行二分截取装饰，不逐行遍历整份索引。 */
export function xmlLineDecorations(
  ranges: readonly TextDecoration[],
  start: number,
  end: number,
): readonly TextDecoration[] {
  let low = 0,
    high = ranges.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (ranges[mid].end <= start) low = mid + 1;
    else high = mid;
  }
  const result: TextDecoration[] = [];
  while (low < ranges.length && ranges[low].start < end) {
    const range = ranges[low++];
    result.push({
      ...range,
      start: Math.max(start, range.start),
      end: Math.min(end, range.end),
    });
  }
  return result;
}
