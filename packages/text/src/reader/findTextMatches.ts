import { throwIfAborted } from '@fivo/core';
import { textLineAt } from './indexLines';
import type { TextDocument, TextMatch, TextSearchOptions } from './types';

/** 使用原文偏移匹配，避免小写转换改变字符长度后高亮错位。 */
export async function* findTextMatches(
  document: TextDocument,
  query: string,
  options: TextSearchOptions,
  signal: AbortSignal,
): AsyncGenerator<readonly TextMatch[]> {
  if (!query) return;
  const pattern = new RegExp(
    query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    options.matchCase ? 'gu' : 'giu',
  );
  const word = /[\p{L}\p{N}_]/u;
  let batch: TextMatch[] = [];
  let scanned = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(document.text))) {
    throwIfAborted(signal);
    if (++scanned % 4096 === 0)
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    const start = match.index,
      end = start + match[0].length;
    const before =
      Array.from(document.text.slice(Math.max(0, start - 2), start)).pop() ??
      '';
    const after =
      end < document.text.length
        ? String.fromCodePoint(document.text.codePointAt(end)!)
        : '';
    if (!options.wholeWord || (!word.test(before) && !word.test(after)))
      batch.push({ start, end, line: textLineAt(document, start) });
    if (batch.length >= 200) {
      yield batch;
      batch = [];
      await new Promise<void>((r) => {
        setTimeout(r, 0);
      });
    }
  }
  throwIfAborted(signal);
  if (batch.length) yield batch;
}
