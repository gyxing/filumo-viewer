import type { ArchiveFactory } from './factoryTypes';
import {
  archiveExtensions,
  archiveFormatForBytes,
  archiveFormatForName,
} from './reader/detectArchive';
/** 注册不初始化解压器；未知具名文件不能仅因 ZIP 签名被归档插件抢占。 */
export const archive: ArchiveFactory = (options = {}) => {
  const resolved = {
    ...options,
    workerFactory:
      options.workerFactory ??
      (() =>
        new Worker(new URL('./worker.js', import.meta.url), {
          type: 'module',
          name: 'filumo-archive',
        })),
  };
  return {
    document: {
      id: 'archive',
      protocolVersion: 1,
      priority: 0,
      extensions: archiveExtensions,
      mimeTypes: [
        'application/zip',
        'application/x-tar',
        'application/gzip',
        'application/x-7z-compressed',
        'application/vnd.rar',
        'application/x-xz',
      ],
      async detect(source, signal) {
        if (archiveFormatForName(source.name)) return true;
        if (source.name && /\.[^./\\]+$/.test(source.name)) return false;
        const reader = await source.getRangeReader?.(signal);
        // 不支持区间的远程来源仍可有界识别，不能依赖其他插件提前缓存全文。
        const bytes = reader
          ? await reader.read(0, Math.min(512, reader.length), signal)
          : await source.readRange?.(0, 512, signal);
        return !!bytes && !!archiveFormatForBytes(bytes);
      },
      async load() {
        return {
          open: (source, context) =>
            import('./runtime/openArchive').then((m) =>
              m.openArchive(source, context, resolved),
            ),
        };
      },
    },
    async loadView() {
      return {
        mount: (context) =>
          import('./view/mountArchive').then((m) => m.mountArchive(context)),
      };
    },
  };
};
