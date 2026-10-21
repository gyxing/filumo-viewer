import type { XmlFactory } from './factoryTypes';
/** XML 只有明确身份才接管，SVG 留给图片插件。 */
export const xml: XmlFactory = (options = {}) => {
  const resolved = {
    ...options,
    workerFactory:
      options.workerFactory ??
      (() =>
        new Worker(new URL('./worker.js', import.meta.url), {
          type: 'module',
          name: 'filumo-xml',
        })),
  };
  return {
    document: {
      id: 'xml',
      protocolVersion: 1,
      priority: 15,
      extensions: ['.xml'],
      mimeTypes: ['application/xml', 'text/xml'],
      async detect(source) {
        const ext = source.name?.toLowerCase().match(/\.[^.]+$/)?.[0];
        return ext
          ? ext === '.xml'
          : ['application/xml', 'text/xml'].includes(
              source.mimeType?.split(';')[0].trim().toLowerCase() ?? '',
            );
      },
      async load() {
        const { openXml } = await import('./runtime/openXml');
        return {
          open: (source, context) => openXml(source, context, resolved),
        };
      },
    },
    async loadView() {
      return {
        mount: (context) =>
          import('./view/mountXml').then((module) => module.mountXml(context)),
      };
    },
  };
};
