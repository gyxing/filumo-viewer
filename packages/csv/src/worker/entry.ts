import { decodeTextTask, serveTextTasks } from '@fivo/core/text';
import type { TextTaskScope } from '@fivo/core/text';
import type { CsvParseOptions } from '../parser/types';
serveTextTasks(globalThis as unknown as TextTaskScope, {
  decode: decodeTextTask,
  'index-csv': async (payload, signal) => {
    const data = payload as { text: string; options: CsvParseOptions };
    if (!data || typeof data.text !== 'string' || !data.options)
      throw new Error('CSV 任务无效');
    return (await import('../parser/scanCsv')).scanCsv(
      data.text,
      data.options,
      signal,
    );
  },
});
