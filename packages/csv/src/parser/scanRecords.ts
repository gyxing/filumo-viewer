import { throwIfAborted } from '@fivo/core';
import type { CsvIndex, CsvParseResult } from './types';

/** 按逻辑记录扫描，引用状态跨块保留，探测只采集完整记录。 */
export async function scanRecords(
  text: string,
  delimiter: CsvIndex['delimiter'],
  maxRows: number,
  maxColumns: number,
  signal: AbortSignal,
  probe = false,
  partial = false,
): Promise<{ result: CsvParseResult; counts: number[] }> {
  const starts: number[] = [],
    ends: number[] = [],
    counts: number[] = [];
  let start = 0,
    fields = 1,
    quoted = false,
    closedQuote = false,
    fieldStart = true,
    columns = 0,
    nextCheck = 65536;
  const failure = (
    kind: 'invalid' | 'limited',
    message: string,
    offset: number,
  ) => ({
    result: { kind, diagnostics: [{ message, offset }] } as CsvParseResult,
    counts,
  });
  const add = (end: number): boolean => {
    starts.push(start);
    ends.push(end);
    columns = Math.max(columns, fields);
    if (probe) counts.push(fields);
    return starts.length >= maxRows;
  };
  for (let i = 0; i < text.length; i++) {
    if (i >= nextCheck) {
      await new Promise<void>((r) => setTimeout(r, 0));
      throwIfAborted(signal);
      nextCheck = i + 65536;
    }
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') i++;
        else {
          quoted = false;
          closedQuote = true;
        }
      }
      continue;
    }
    if (char === delimiter) {
      fields++;
      if (fields > maxColumns)
        return failure(
          'limited',
          '表格列数超过限制，请查看原文或提高列数配置。',
          i,
        );
      fieldStart = true;
      closedQuote = false;
      continue;
    }
    if (char === '\r' || char === '\n') {
      const full = add(i);
      if (char === '\r' && text[i + 1] === '\n') i++;
      start = i + 1;
      fields = 1;
      fieldStart = true;
      closedQuote = false;
      if (full) {
        if (probe) break;
        if (start < text.length)
          return failure(
            'limited',
            '表格记录数超过限制，请查看完整原文。',
            start,
          );
      }
      continue;
    }
    if (closedQuote)
      return failure('invalid', '引号字段结束后只能出现分隔符或换行。', i);
    if (char === '"') {
      if (!fieldStart)
        return failure('invalid', '未加引号字段中出现了双引号。', i);
      quoted = true;
    }
    fieldStart = false;
  }
  throwIfAborted(signal);
  if (!partial && quoted)
    return failure('invalid', '引号字段没有结束。', text.length);
  if (!partial && start < text.length && (!probe || starts.length < maxRows))
    add(text.length);
  return {
    result: {
      kind: 'ready',
      index: {
        delimiter,
        rowStarts: Uint32Array.from(starts),
        rowEnds: Uint32Array.from(ends),
        columnCount: columns,
      },
    },
    counts,
  };
}
