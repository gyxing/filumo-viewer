import { throwIfAborted } from '@fivo/core';
import type { CsvCell, CsvIndex } from './types';

/** 可见行才解析字段范围；超长逻辑行分段让出执行权。 */
export async function readCsvRow(
  text: string,
  index: CsvIndex,
  row: number,
  signal: AbortSignal,
): Promise<readonly CsvCell[]> {
  if (row < 0 || row >= index.rowStarts.length) return [];
  const cells: CsvCell[] = [],
    end = index.rowEnds[row];
  let start = index.rowStarts[row],
    quoted = false,
    column = 0,
    next = start + 65536;
  for (let i = start; i < end; i++) {
    if (i >= next) {
      await new Promise<void>((r) => setTimeout(r, 0));
      throwIfAborted(signal);
      next = i + 65536;
    }
    if (text[i] === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted && text[i] === index.delimiter) {
      cells.push({
        start,
        end: i,
        column: column++,
        quoted: text[start] === '"',
      });
      start = i + 1;
    }
  }
  throwIfAborted(signal);
  cells.push({ start, end, column, quoted: text[start] === '"' });
  return cells;
}

/** 显示预算只截断预览；复制调用不传 maxChars，始终得到完整字段。 */
export async function csvCellText(
  text: string,
  cell: CsvCell,
  options: { maxChars?: number; signal: AbortSignal },
): Promise<string> {
  throwIfAborted(options.signal);
  const max = options.maxChars ?? Infinity;
  if (!cell.quoted)
    return text.slice(cell.start, Math.min(cell.end, cell.start + max));
  const pieces: string[] = [];
  let part = '',
    size = 0,
    next = cell.start + 65536;
  for (let i = cell.start + 1; i < cell.end - 1 && size < max; i++) {
    if (i >= next) {
      pieces.push(part);
      part = '';
      await new Promise<void>((r) => setTimeout(r, 0));
      throwIfAborted(options.signal);
      next = i + 65536;
    }
    const char = text[i];
    part += char;
    size++;
    if (char === '"' && text[i + 1] === '"') i++;
  }
  pieces.push(part);
  return pieces.join('');
}
