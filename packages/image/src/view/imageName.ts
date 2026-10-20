// 无后缀的资源只使用已知图片 MIME 补全文件名。
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/tiff': 'tiff',
  'image/x-emf': 'emf',
  'image/x-wmf': 'wmf',
};
/** 预览标题和下载保留原名称后缀；缺失后缀才使用已知 MIME 补齐。 */
export function getImageFileName(model: {
  name?: string;
  alt?: string;
  id?: string;
  mimeType?: string;
}): string {
  const name =
    (model.name || model.alt || model.id || 'image')
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .replace(/[.\s]+$/g, '') || 'image';
  const existing = name.match(/\.[a-z0-9]{2,6}$/i)?.[0];
  if (existing)
    return (
      name.slice(0, -existing.length).slice(0, 120 - existing.length) + existing
    );
  const extension = EXTENSIONS[model.mimeType?.toLowerCase() ?? ''];
  const suffix = extension ? '.' + extension : '';
  return name.slice(0, 120 - suffix.length) + suffix;
}
