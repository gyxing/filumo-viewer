import type { CodeFactory } from './factoryTypes';
import { codeExtensions, detectCodeLanguage } from './fileTypes';
/** 工厂仅发布身份与加载边界，不加载高亮器或原文视图。 */
export const code: CodeFactory = (options = {}) => {
  const resolved = {
    ...options,
    workerFactory:
      options.workerFactory ??
      (() =>
        new Worker(new URL('./worker.js', import.meta.url), {
          type: 'module',
          name: 'fivo-code',
        })),
  };
  return {
    document: {
      id: 'code',
      protocolVersion: 1,
      priority: 10,
      extensions: Object.keys(codeExtensions),
      mimeTypes: [],
      async detect(source) {
        return detectCodeLanguage(source.name) !== undefined;
      },
      async load() {
        const { openCode } = await import('./runtime/openCode');
        return {
          open: (source, context) => openCode(source, context, resolved),
        };
      },
    },
    async loadView() {
      return {
        mount: (context) =>
          import('./view/mountCode').then((module) =>
            module.mountCode(context),
          ),
      };
    },
  };
};
