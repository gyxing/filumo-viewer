import { createSession } from '@fivo/core';
import type { DocumentSource, OpenContext } from '@fivo/core';
import { TextContent } from '@fivo/core/text';
import type { TaskWorker } from '@fivo/core/text';
import type { CsvOptions } from '../options';
import { CsvSession } from './CsvSession';

/** 先解码，索引在进入表格时才建立，来源字节不因模式切换重读。 */
export async function openCsv(
  source: DocumentSource,
  context: OpenContext,
  options: CsvOptions & { workerFactory: () => TaskWorker },
) {
  for (const value of [
    options.maxRows ?? 1000000,
    options.maxColumns ?? 4096,
    options.maxCachedCells ?? 20000,
    options.cellCacheBytes ?? 4194304,
    options.maxCellDetailChars ?? 65536,
  ])
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error('CSV 预算必须是正整数');
  const bytes = await source.readAll(context.signal);
  const delimiter =
    options.delimiter ??
    (/\.tsv$/i.test(source.name ?? '') ||
    source.mimeType?.split(';')[0].trim().toLowerCase() ===
      'text/tab-separated-values'
      ? '\t'
      : 'auto');
  if (!['auto', ',', ';', '\t', '|'].includes(delimiter))
    throw new Error('分隔符无效');
  const content = new TextContent(
    bytes,
    { ...options, mimeType: source.mimeType },
    context.signal,
    async (task, payload, signal) => {
      if (task !== 'index-csv') throw new Error('未知 CSV 任务');
      const data = payload as {
        text: string;
        options: import('../parser/types').CsvParseOptions;
      };
      return (await import('../parser/scanCsv')).scanCsv(
        data.text,
        data.options,
        signal,
      );
    },
  );
  const data = new CsvSession(content, options, delimiter);
  try {
    await content.setEncoding(options.encoding ?? 'auto');
    return createSession({
      sessionId: context.sessionId,
      source,
      signal: context.signal,
      format: 'csv',
      data,
      dispose: () => {
        data.dispose();
        content.dispose();
      },
    });
  } catch (error) {
    data.dispose();
    content.dispose();
    throw error;
  }
}
