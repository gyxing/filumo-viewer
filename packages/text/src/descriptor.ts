import type { TextFactory } from './factoryTypes';
// 专用格式不由通用 text/plain 提前接管，显式 pluginId 仍可选择原文打开。
const RESERVED =
  /\.(?:md|markdown|json|jsonc|json5|jsonl|ndjson|docx?|xlsx?|pptx?|pdf)$/i;
const DEFAULT_EXTENSIONS = [
  '.txt',
  '.log',
  '.ini',
  '.conf',
  '.cfg',
  '.properties',
  '.out',
];
/** 工厂只发布描述符；正文、样式和 Worker 均在真正打开后加载。 */
export const text: TextFactory = (options = {}) => {
  const resolved = {
    ...options,
    workerFactory:
      options.workerFactory ??
      (() =>
        new Worker(new URL('./worker.js', import.meta.url), {
          type: 'module',
          name: 'fivo-text',
        })),
  };
  const extensions = [
    ...new Set(
      [...DEFAULT_EXTENSIONS, ...(options.extensions ?? [])].map((s) =>
        s.startsWith('.') ? s.toLowerCase() : '.' + s.toLowerCase(),
      ),
    ),
  ];
  return {
    document: {
      id: 'text',
      protocolVersion: 1,
      priority: -10,
      extensions,
      mimeTypes: ['text/plain'],
      async detect(source, signal) {
        if (source.name && RESERVED.test(source.name)) return false;
        const extension = source.name?.toLowerCase().match(/\.[^.]+$/)?.[0];
        if (extension && extensions.includes(extension)) return true;
        if (source.mimeType?.split(';')[0].toLowerCase() === 'text/plain')
          return true;
        if (!source.readRange || extension) return false;
        const prefix = await source.readRange(0, 1024, signal);
        if (
          (prefix[0] === 0xff && prefix[1] === 0xfe) ||
          (prefix[0] === 0xfe && prefix[1] === 0xff)
        )
          return true;
        if (
          prefix.some(
            (byte) => byte === 0 || byte < 9 || (byte > 13 && byte < 32),
          )
        )
          return false;
        try {
          new TextDecoder('utf-8', { fatal: true }).decode(prefix, {
            stream: true,
          });
          return true;
        } catch {
          return false;
        }
      },
      async load() {
        const { openText } = await import('./runtime/openText');
        return {
          open: (source, context) => openText(source, context, resolved),
        };
      },
    },
    async loadView() {
      const { mountText } = await import('./runtime/mountText');
      return { mount: mountText };
    },
  };
};
