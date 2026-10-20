import type { CsvIndex } from './types';
import { scanRecords } from './scanRecords';

/** 无可靠样本时确定回退到逗号，避免用半条引号记录猜测分隔符。 */
export async function detectCsvDelimiter(
  text: string,
  signal: AbortSignal,
): Promise<CsvIndex['delimiter']> {
  let chosen: CsvIndex['delimiter'] = ',',
    best = 0;
  const sample = text.slice(0, 65536);
  for (const delimiter of [',', ';', '\t', '|'] as const) {
    const { result, counts } = await scanRecords(
      sample,
      delimiter,
      20,
      4096,
      signal,
      true,
      text.length > sample.length,
    );
    if (result.kind !== 'ready' || !counts.length) continue;
    const histogram = new Map<number, number>();
    for (const count of counts)
      if (count > 1) histogram.set(count, (histogram.get(count) ?? 0) + 1);
    const score = Math.max(0, ...histogram.values()) / counts.length;
    if (score > best) {
      best = score;
      chosen = delimiter;
    }
  }
  return chosen;
}
