import type { PdfFactory } from './factoryTypes';
/** PDF 描述符不加载引擎；未知无名来源只检查文件头。 */
export const pdf: PdfFactory = (options = {}) => ({
  document: {
    id: 'pdf',
    protocolVersion: 1,
    priority: 20,
    extensions: ['.pdf'],
    mimeTypes: ['application/pdf'],
    async detect(source, signal) {
      const extension = source.name?.toLowerCase().match(/\.[^.]+$/)?.[0];
      if (extension === '.pdf') return true;
      if (
        source.mimeType?.split(';')[0].trim().toLowerCase() ===
        'application/pdf'
      )
        return true;
      if (extension) return false;
      const reader = await source.getRangeReader?.(signal);
      const bytes = reader
        ? await reader.read(0, 5, signal)
        : await source.readRange?.(0, 5, signal);
      if (!bytes) return false;
      return [37, 80, 68, 70, 45].every((byte, index) => bytes[index] === byte);
    },
    async load() {
      return {
        open: (source, context) =>
          import('./runtime/openPdf').then((m) =>
            m.openPdf(source, context, options),
          ),
      };
    },
  },
  async loadView() {
    return {
      mount: (context) =>
        import('./view/mountPdf').then((m) => m.mountPdf(context)),
    };
  },
});
