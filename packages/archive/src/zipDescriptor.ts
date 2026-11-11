import type { ArchiveFactory } from './factoryTypes';
/** ZIP 独立入口复用归档界面，解析依赖限定为 ZIP。 */
export const zip: ArchiveFactory = (options = {}) => {
  const resolved = {
    ...options,
    workerFactory:
      options.workerFactory ??
      (() =>
        new Worker(new URL('./zip-worker.js', import.meta.url), {
          type: 'module',
          name: 'filumo-zip',
        })),
  };
  return {
    document: {
      id: 'archive',
      protocolVersion: 1,
      priority: 0,
      extensions: ['.zip'],
      mimeTypes: ['application/zip', 'application/x-zip-compressed'],
      async detect(source, signal) {
        if (/\.zip$/i.test(source.name ?? '')) return true;
        if (source.name && /\.[^./\\]+$/.test(source.name)) return false;
        const reader = await source.getRangeReader?.(signal);
        const bytes = reader
          ? await reader.read(0, Math.min(4, reader.length), signal)
          : await source.readRange?.(0, 4, signal);
        return (
          !!bytes &&
          bytes[0] === 0x50 &&
          bytes[1] === 0x4b &&
          ((bytes[2] === 3 && bytes[3] === 4) ||
            (bytes[2] === 5 && bytes[3] === 6))
        );
      },
      async load() {
        return {
          open: (source, context) =>
            import('./runtime/openArchive').then((module) =>
              module.openArchive(source, context, resolved),
            ),
        };
      },
    },
    async loadView() {
      return {
        mount: (context) =>
          import('./view/mountArchive').then((module) =>
            module.mountArchive(context),
          ),
      };
    },
  };
};
