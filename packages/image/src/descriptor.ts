import type { ImageFactory } from './factoryTypes';
// SVG 仅接管明确声明的图片输入，不把任意 XML 当作可预览图像。
const EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
  '.avif',
];
const MIME = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/svg+xml',
  'image/avif',
];
/** 注册时只发布格式身份，不接触 DOM、解码器或图片样式。 */
export const image: ImageFactory = (options = {}) => ({
  document: {
    id: 'image',
    protocolVersion: 1,
    priority: 15,
    extensions: EXTENSIONS,
    mimeTypes: MIME,
    async detect(source, signal) {
      const extension = source.name?.toLowerCase().match(/\.[^.]+$/)?.[0];
      if (extension && EXTENSIONS.includes(extension)) return true;
      if (
        MIME.includes(source.mimeType?.split(';')[0].trim().toLowerCase() ?? '')
      )
        return true;
      if (extension) return false;
      if (!source.readRange) return false;
      const { detectImageBytes } = await import('./runtime/detectImage');
      return detectImageBytes(await source.readRange(0, 32, signal));
    },
    async load() {
      return {
        open: (source, context) =>
          import('./runtime/openImage').then((m) =>
            m.openImage(source, context, options),
          ),
      };
    },
  },
  async loadView() {
    return {
      mount: (context) =>
        import('./view/mountImageViewer').then((m) =>
          m.mountImageViewer(context),
        ),
    };
  },
});
