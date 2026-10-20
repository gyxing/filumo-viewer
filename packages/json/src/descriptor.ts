import type { JsonFactory } from './factoryTypes';
/** JSON 只按明确元数据接管，描述符不解析正文。 */
export const json: JsonFactory = (options = {}) => {
  const resolved = {
    ...options,
    workerFactory:
      options.workerFactory ??
      (() =>
        new Worker(new URL('./worker.js', import.meta.url), {
          type: 'module',
          name: 'fivo-json',
        })),
  };
  return {
    document: {
      id: 'json',
      protocolVersion: 1,
      priority: 10,
      extensions: ['.json', '.jsonc', '.jsonl', '.ndjson'],
      mimeTypes: [
        'application/json',
        'application/jsonc',
        'application/x-ndjson',
        'application/ndjson',
        'application/jsonl',
      ],
      async detect(source) {
        const extension = source.name?.toLowerCase().match(/\.[^.]+$/)?.[0];
        if (extension)
          return ['.json', '.jsonc', '.jsonl', '.ndjson'].includes(extension);
        return [
          'application/json',
          'application/jsonc',
          'application/x-ndjson',
          'application/ndjson',
          'application/jsonl',
        ].includes(source.mimeType?.split(';')[0].trim().toLowerCase() ?? '');
      },
      async load() {
        const { openJson } = await import('./runtime/openJson');
        return {
          open: (source, context) => openJson(source, context, resolved),
        };
      },
    },
    async loadView() {
      const { mountJson } = await import('./view/mountJson');
      return { mount: mountJson };
    },
  };
};
