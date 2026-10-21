import type { CsvFactory } from './factoryTypes';
/** 注册只声明身份，不创建 Worker 或加载解析和表格模块。 */
export const csv: CsvFactory = (options = {}) => {
  const resolved = {
    ...options,
    workerFactory:
      options.workerFactory ??
      (() =>
        new Worker(new URL('./worker.js', import.meta.url), {
          type: 'module',
          name: 'filumo-csv',
        })),
  };
  return {
    document: {
      id: 'csv',
      protocolVersion: 1,
      priority: 10,
      extensions: ['.csv', '.tsv'],
      mimeTypes: ['text/csv', 'text/tab-separated-values'],
      async detect(source) {
        const ext = source.name?.toLowerCase().match(/\.[^.]+$/)?.[0];
        return ext
          ? ['.csv', '.tsv'].includes(ext)
          : ['text/csv', 'text/tab-separated-values'].includes(
              source.mimeType?.split(';')[0].trim().toLowerCase() ?? '',
            );
      },
      async load() {
        const { openCsv } = await import('./runtime/openCsv');
        return {
          open: (source, context) => openCsv(source, context, resolved),
        };
      },
    },
    async loadView() {
      return {
        mount: (context) =>
          import('./view/mountCsv').then((m) => m.mountCsv(context)),
      };
    },
  };
};
