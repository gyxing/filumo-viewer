import { abortError } from '@fivo/core';
import type { OfficeResourceSource } from '../../engine/resource-store/types';
import type { ResourceLease } from '../../services/OfficeResourceService';
import type { ElementView, OfficeRenderContext } from '../types';
export interface ImageViewModel {
  source: OfficeResourceSource;
  alt?: string;
  className?: string;
}
/** 每次显示持有独立资源租约；源变更、取消和卸载不允许迟到 URL 回写。 */
export async function mountImage(
  container: HTMLElement,
  model: ImageViewModel,
  context: OfficeRenderContext,
): Promise<ElementView<ImageViewModel>> {
  const image = context.document.createElement('img');
  image.decoding = 'async';
  image.loading = 'lazy';
  container.append(image);
  let closed = false,
    version = 0;
  let lease: ResourceLease | undefined;
  let pending: AbortController | undefined;
  const dispose = () => {
    if (closed) return;
    closed = true;
    version++;
    pending?.abort();
    lease?.release();
    lease = undefined;
    image.remove();
    context.signal.removeEventListener('abort', dispose);
  };
  const update = async (next: ImageViewModel) => {
    if (closed) throw abortError();
    const current = ++version;
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    image.alt = next.alt ?? '';
    image.className = next.className ?? '';
    const acquired = await context.services.resources.acquire(
      next.source,
      controller.signal,
    );
    if (closed || current !== version || controller.signal.aborted) {
      acquired.release();
      return;
    }
    const previous = lease;
    lease = acquired;
    image.src = acquired.url;
    previous?.release();
  };
  context.signal.addEventListener('abort', dispose, { once: true });
  if (context.signal.aborted) {
    dispose();
    throw abortError();
  }
  try {
    await update(model);
  } catch (error) {
    dispose();
    throw error;
  }
  return {
    update,
    setActive(active) {
      image.hidden = !active;
    },
    dispose,
  };
}
