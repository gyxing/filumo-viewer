import type { DocumentSource, OpenContext } from '@filumo/core';
import { createSession, throwIfAborted } from '@filumo/core';
import type { ImageOptions } from '../options';
import type { ImageSession } from './ImageSession';
// 文件选择器和通用下载接口常丢失 MIME，按已识别的图片后缀补全解码类型。
const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
};
/** 保留原始 Blob，下载与显示不通过 Canvas 重新编码。 */
export async function openImage(
  source: DocumentSource,
  context: OpenContext,
  options: ImageOptions,
) {
  if (
    options.maxDecodedPixels !== undefined &&
    (!Number.isSafeInteger(options.maxDecodedPixels) ||
      options.maxDecodedPixels <= 0)
  )
    throw new Error('图片像素限制必须为正整数');
  const original =
    (await source.readBlob?.(context.signal)) ??
    new Blob([await source.readAll(context.signal)], { type: source.mimeType });
  throwIfAborted(context.signal);
  const extension = source.name?.toLowerCase().match(/\.([^.]+)$/)?.[1],
    declared = source.mimeType?.split(';')[0].trim().toLowerCase();
  const inferred = declared?.startsWith('image/')
    ? declared
    : MIME_BY_EXTENSION[extension ?? ''];
  const blob =
    inferred && !original.type.toLowerCase().startsWith('image/')
      ? original.slice(0, original.size, inferred)
      : original;
  return createSession<ImageSession>({
    ...context,
    source,
    format: 'image',
    data: { blob, name: source.name, options },
  });
}
