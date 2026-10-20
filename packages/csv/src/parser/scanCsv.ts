import { detectCsvDelimiter } from './detectDelimiter';
import { scanRecords } from './scanRecords';
import type { CsvParseOptions, CsvParseResult } from './types';

/** 建立有预算的逻辑行索引，不复制完整单元格矩阵。 */
export async function scanCsv(
  text: string,
  options: CsvParseOptions,
  signal: AbortSignal,
): Promise<CsvParseResult> {
  const delimiter =
    options.delimiter === 'auto'
      ? await detectCsvDelimiter(text, signal)
      : options.delimiter;
  return (
    await scanRecords(
      text,
      delimiter,
      options.maxRows,
      options.maxColumns,
      signal,
    )
  ).result;
}
