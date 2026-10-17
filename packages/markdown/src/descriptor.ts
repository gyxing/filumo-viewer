import type { MarkdownFactory } from './factoryTypes';
/** 注册时不导入 Marked 或高亮器，真实文件打开后按当前模式加载。 */
export const markdown: MarkdownFactory = (options = {}) => {
  const resolved = {
    ...options,
    workerFactory:
      options.workerFactory ??
      (() =>
        new Worker(new URL('./worker.js', import.meta.url), {
          type: 'module',
          name: 'fivo-markdown',
        })),
  };
  return {
    document: {
      id: 'markdown',
      protocolVersion: 1,
      priority: 10,
      extensions: ['.md', '.markdown'],
      mimeTypes: ['text/markdown'],
      async detect(source) {
        const extension = source.name?.toLowerCase().match(/\.[^.]+$/)?.[0];
        if (extension) return extension === '.md' || extension === '.markdown';
        return (
          source.mimeType?.split(';')[0].trim().toLowerCase() ===
          'text/markdown'
        );
      },
      async load() {
        const { openMarkdown } = await import('./runtime/openMarkdown');
        return {
          open: (source, context) => openMarkdown(source, context, resolved),
        };
      },
    },
    async loadView() {
      const { mountMarkdown } = await import('./view/mountMarkdown');
      return { mount: mountMarkdown };
    },
  };
};
