import {
  OFFICE_FORMAT_METADATA,
  SUPPORTED_OFFICE_EXTENSIONS,
} from './engine/parsing/formatDefinitions';
import type { OfficeFactory } from './factoryTypes';

/** 注册轻量 Office 描述符，真正打开文件时才加载解析与视图代码。 */
export const office: OfficeFactory = (options = {}) => {
  const mimeTypes: string[] = Object.values(OFFICE_FORMAT_METADATA).flatMap(
    (format) => format.mimeTypes.map((item) => item.mimeType),
  );
  const builtInWorker = () =>
    new Worker(new URL('./worker.js', import.meta.url), {
      type: 'module',
      name: 'fivo-office',
    });
  return {
    document: {
      id: 'office',
      protocolVersion: 1,
      extensions: SUPPORTED_OFFICE_EXTENSIONS,
      mimeTypes,
      async detect(source, signal) {
        const extension = source.name?.toLowerCase().match(/\.[^.]+$/)?.[0];
        const metadataMatch = Boolean(
          (extension &&
            (SUPPORTED_OFFICE_EXTENSIONS as readonly string[]).includes(
              extension,
            )) ||
            (source.mimeType &&
              mimeTypes.includes(source.mimeType.split(';')[0])),
        );
        if (metadataMatch) return true;
        const bytes = source.readRange
          ? await source.readRange(0, 8, signal)
          : await source.readAll(signal);
        // 仅识别容器签名；细分格式目录检查延后到 Office 驱动，保持描述符轻量。
        return (
          (bytes[0] === 0x50 &&
            bytes[1] === 0x4b &&
            bytes[2] === 3 &&
            bytes[3] === 4) ||
          [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
            (value, index) => bytes[index] === value,
          )
        );
      },
      async load() {
        const { openOffice } = await import('./runtime/openOffice');
        return {
          open: (source, context) =>
            openOffice(source, context, {
              ...options,
              workerFactory:
                options.workerFactory ??
                (typeof Worker === 'undefined' ? undefined : builtInWorker),
            }),
        };
      },
    },
    async loadView() {
      const { mountSelectedOffice } = await import('./runtime/selectRenderer');
      return { mount: mountSelectedOffice };
    },
  };
};
