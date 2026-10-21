import type { DocumentSource } from '@filumo/core';
import type { TextFactory } from './factoryTypes';
// 专用格式不由通用 text/plain 提前接管，显式 pluginId 仍可选择原文打开。
const RESERVED =
  /\.(?:md|markdown|json|jsonc|json5|jsonl|ndjson|docx?|xlsx?|pptx?|pdf)$/i;
// 常规探测先按后缀排序，这些明确构建/环境文件名必须给 Code 留出机会。
const RESERVED_CODE_NAMES =
  /(?:^|[\\/])(?:CMakeLists\.txt|Dockerfile(?:\.[^\\/]+)?|\.env(?:\.[^\\/]+)?)$/i;
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
  // 来源仅作弱引用标记，取消发生在探测与打开之间时也不会长期保留文件。
  const fallbackSources = new WeakSet<DocumentSource>();
  const resolved = {
    ...options,
    workerFactory:
      options.workerFactory ??
      (() =>
        new Worker(new URL('./worker.js', import.meta.url), {
          type: 'module',
          name: 'filumo-text',
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
      async detect(source) {
        if (
          source.name &&
          (RESERVED.test(source.name) || RESERVED_CODE_NAMES.test(source.name))
        )
          return false;
        const extension = source.name?.toLowerCase().match(/\.[^.]+$/)?.[0];
        // MIME 可能来自错误的服务器声明，未知后缀和无名内容留到兜底阶段判断。
        return Boolean(extension && extensions.includes(extension));
      },
      detectFallback:
        options.fallback === false
          ? undefined
          : async (source, signal, policy) => {
              const { probeTextSource } = await import('./reader/probeText');
              const matched = await probeTextSource(source, signal, policy);
              if (matched) fallbackSources.add(source);
              return matched;
            },
      async load() {
        const { openText } = await import('./runtime/openText');
        return {
          open: (source, context) =>
            openText(source, context, resolved, fallbackSources.delete(source)),
        };
      },
    },
    async loadView() {
      const { mountText } = await import('./runtime/mountText');
      return { mount: mountText };
    },
  };
};
