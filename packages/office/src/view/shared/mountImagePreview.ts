import {
  downloadOfficeImageSource,
  getOfficeImageDownloadName,
} from '../../shared/image-preview/downloadOfficeImage';
import type { OfficeRenderContext } from '../types';
import type { ImageViewModel } from './mountImage';
export interface ImagePreviewModel extends ImageViewModel {
  id?: string;
  name?: string;
  mimeType?: string;
  download?: boolean;
}

/** Office 仅适配资源和原文件下载；实际图片交互按操作加载公共 image/view。 */
export async function mountImagePreview(
  model: ImagePreviewModel,
  trigger: HTMLElement,
  context: OfficeRenderContext,
) {
  const { mountImageOverlay } = await import('@fivo/image/view');
  if (context.signal.aborted) throw context.signal.reason;
  const target = { ...model, id: model.id ?? 'image' };
  const host =
    context.container.closest<HTMLElement>('.fivo-viewer') ?? context.container;
  const overlay = await mountImageOverlay(
    host,
    {
      id: target.id,
      name: getOfficeImageDownloadName(target),
      mimeType: model.mimeType,
      alt: model.alt,
      resolve: (signal) =>
        context.services.resources.acquire(model.source, signal),
      download:
        model.download === false
          ? undefined
          : (signal) =>
              downloadOfficeImageSource(target, context.document, signal),
    },
    {
      signal: context.signal,
      trigger,
      locale: context.locale,
      stylePolicy: context.stylePolicy,
      zoomReference: 'relative-fit',
    },
  );
  // 弹层覆盖整个外壳，因此显式同步 Office 停用状态及清理订阅。
  const stop = context.onActiveChange?.(overlay.setActive);
  overlay.setActive(context.isActive?.() ?? true);
  let disposed = false;
  const dispose = () => {
    if (!disposed) {
      disposed = true;
      stop?.();
      context.signal.removeEventListener('abort', cancel);
    }
    return overlay.dispose();
  };
  function cancel() {
    void dispose().catch(context.onError);
  }
  context.signal.addEventListener('abort', cancel, { once: true });
  if (context.signal.aborted) await dispose();
  return { ...overlay, dispose };
}
