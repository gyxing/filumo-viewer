import { abortError, notify, throwIfAborted } from '@filumo/core';
import { useStyles as acquireStyles } from '@filumo/dom';
import { STYLE_SCOPE } from '../generated/package';
import './image.less';
import { calculateImageFitScale } from './imageTransform';
import type {
  ImageLease,
  ImageModel,
  ImageSurfaceHandle,
  ImageSurfaceOptions,
  ImageSurfaceState,
} from './types';

/** 图片交互核心独立于文档格式与弹层；每个实例只拥有自身的一份资源租约。 */
export async function mountImageSurface(
  container: HTMLElement,
  model: ImageModel,
  initialOptions: ImageSurfaceOptions,
): Promise<ImageSurfaceHandle> {
  const document = container.ownerDocument,
    window = document.defaultView;
  const releaseStyles = acquireStyles(
    'image',
    document,
    initialOptions.stylePolicy,
  );
  const scope = document.createElement('div');
  scope.className = STYLE_SCOPE! + ' filumo-image-scope';
  const viewport = document.createElement('div'),
    image = document.createElement('img'),
    status = document.createElement('div');
  viewport.className = 'filumo-image-surface';
  viewport.tabIndex = 0;
  image.alt = model.alt ?? '';
  image.decoding = 'async';
  image.draggable = false;
  status.setAttribute('role', 'status');
  viewport.append(image, status);
  scope.append(viewport);
  container.append(scope);
  const listeners = new Set<() => void>();
  const releases = new Set<Promise<void>>();
  const releaseLease = (owned?: ImageLease): Promise<void> => {
    if (!owned) return Promise.resolve();
    const pending = Promise.resolve().then(() => owned.release());
    releases.add(pending);
    void pending.then(
      () => releases.delete(pending),
      () => releases.delete(pending),
    );
    return pending;
  };
  let options = initialOptions,
    closed = false,
    active = true,
    generation = 0;
  let lease: ImageLease | undefined,
    loading = new AbortController();
  let frame: number | undefined, cancelLoad: (() => void) | undefined;
  let disposing: Promise<void> | undefined;
  let resize: ResizeObserver | undefined;
  let close = () => {};
  let drag: { id: number; x: number; y: number } | undefined;
  let state: ImageSurfaceState = {
    mode: 'fit',
    scale: 1,
    fitScale: 1,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
    naturalWidth: 0,
    naturalHeight: 0,
    status: 'loading',
  };
  const publish = (next: Partial<ImageSurfaceState>) => {
    state = { ...state, ...next };
    notify(listeners);
  };
  const label = () => {
    const en = options.locale === 'en-US';
    viewport.setAttribute('aria-label', en ? 'Image viewport' : '图片视口');
    status.textContent =
      state.status === 'loading'
        ? en
          ? 'Loading image…'
          : '正在加载图片…'
        : state.status === 'error'
        ? (en ? 'Image loading failed: ' : '图片加载失败：') +
          state.error?.message
        : '';
  };
  const layout = () => {
    frame = undefined;
    if (closed || !active) return;
    const fitScale = calculateImageFitScale(
      state.naturalWidth,
      state.naturalHeight,
      Math.max(1, viewport.clientWidth - 48),
      Math.max(1, viewport.clientHeight - 48),
      state.rotation,
    );
    const scale =
      state.mode === 'fit'
        ? fitScale
        : state.mode === 'actual'
        ? 1
        : options.zoomReference === 'relative-fit'
        ? (fitScale * state.scale) / state.fitScale
        : state.scale;
    image.style.width = state.naturalWidth + 'px';
    image.style.height = state.naturalHeight + 'px';
    image.style.visibility = state.status === 'ready' ? 'visible' : 'hidden';
    image.style.transform = `translate(-50%, -50%) translate3d(${state.offsetX}px, ${state.offsetY}px, 0) rotate(${state.rotation}deg) scale(${scale})`;
    if (scale !== state.scale || fitScale !== state.fitScale)
      publish({ scale, fitScale });
  };
  const schedule = () => {
    if (closed || !active || frame !== undefined) return;
    if (window) frame = window.requestAnimationFrame(layout);
    else layout();
  };
  const load = async () => {
    const token = ++generation;
    loading.abort();
    cancelLoad?.();
    loading = new AbortController();
    const signal = loading.signal;
    const old = lease;
    lease = undefined;
    image.removeAttribute('src');
    try {
      await releaseLease(old);
    } catch (cause) {
      if (!closed && token === generation) {
        publish({
          status: 'error',
          error: cause instanceof Error ? cause : new Error(String(cause)),
        });
        label();
      }
      return;
    }
    if (closed || token !== generation) return;
    publish({ status: 'loading', error: undefined });
    label();
    schedule();
    try {
      const acquired = await model.resolve(signal);
      if (closed || token !== generation || signal.aborted) {
        await releaseLease(acquired);
        return;
      }
      lease = acquired;
      await new Promise<void>((resolve, reject) => {
        let abort = () => {};
        const finish = (error?: unknown) => {
          image.onload = null;
          image.onerror = null;
          signal.removeEventListener('abort', abort);
          if (token === generation) cancelLoad = undefined;
          if (error) reject(error);
          else resolve();
        };
        abort = () => finish(signal.reason ?? abortError());
        cancelLoad = abort;
        image.onload = () => finish();
        image.onerror = () =>
          finish(
            new Error(
              options.locale === 'en-US'
                ? 'Image cannot be decoded'
                : '图片损坏或浏览器不支持此格式',
            ),
          );
        signal.addEventListener('abort', abort, { once: true });
        image.src = acquired.url;
        if (signal.aborted) abort();
      });
      throwIfAborted(signal);
      if (closed || token !== generation) return;
      if (
        options.maxDecodedPixels !== undefined &&
        image.naturalWidth * image.naturalHeight > options.maxDecodedPixels
      )
        throw new Error(
          options.locale === 'en-US'
            ? 'Image pixel limit exceeded'
            : '图片像素超过配置限制',
        );
      publish({
        status: 'ready',
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      });
    } catch (cause) {
      if (closed || token !== generation || signal.aborted) return;
      const failed = lease;
      lease = undefined;
      image.removeAttribute('src');
      await releaseLease(failed).catch(() => undefined);
      if (closed || token !== generation) return;
      publish({
        status: 'error',
        error: cause instanceof Error ? cause : new Error(String(cause)),
      });
    }
    label();
    schedule();
  };
  const handle: ImageSurfaceHandle = {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setScale(scale) {
      if (!Number.isFinite(scale) || scale <= 0) return;
      publish({ mode: 'percentage', scale });
      schedule();
    },
    fit() {
      publish({ mode: 'fit', offsetX: 0, offsetY: 0 });
      schedule();
    },
    actual() {
      publish({ mode: 'actual', scale: 1, offsetX: 0, offsetY: 0 });
      schedule();
    },
    rotate() {
      publish({
        rotation: (state.rotation + 90) % 360,
        offsetX: 0,
        offsetY: 0,
      });
      schedule();
    },
    reset() {
      publish({ mode: 'fit', rotation: 0, offsetX: 0, offsetY: 0 });
      schedule();
    },
    retry: load,
    update(next) {
      options = { ...options, ...next };
      label();
    },
    setActive(value) {
      if (closed) return;
      active = value;
      scope.hidden = !value;
      if (value) {
        resize?.observe(viewport);
        schedule();
      } else {
        resize?.disconnect();
        if (frame !== undefined) window?.cancelAnimationFrame(frame);
        frame = undefined;
        drag = undefined;
      }
    },
    dispose() {
      if (disposing) return disposing;
      closed = true;
      generation++;
      loading.abort();
      cancelLoad?.();
      resize?.disconnect();
      if (frame !== undefined) window?.cancelAnimationFrame(frame);
      options.signal.removeEventListener('abort', close);
      image.removeAttribute('src');
      scope.remove();
      listeners.clear();
      releaseStyles();
      const previous = lease;
      lease = undefined;
      // 重试可能正在归还旧租约，销毁必须同时等待这些已拥有资源的释放。
      const release = releaseLease(previous);
      disposing = Promise.allSettled([...releases, release]).then((results) => {
        const failed = results.find((result) => result.status === 'rejected');
        if (failed?.status === 'rejected') throw failed.reason;
      });
      return disposing;
    },
  };
  close = () => {
    void handle.dispose().catch(() => undefined);
  };
  const Resize = window?.ResizeObserver;
  resize = Resize ? new Resize(schedule) : undefined;
  resize?.observe(viewport);
  options.signal.addEventListener('abort', close, { once: true });
  viewport.onpointerdown = (event) => {
    if (!active || event.button !== 0 || state.status !== 'ready') return;
    viewport.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  viewport.onpointermove = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    publish({
      offsetX: state.offsetX + event.clientX - drag.x,
      offsetY: state.offsetY + event.clientY - drag.y,
    });
    drag.x = event.clientX;
    drag.y = event.clientY;
    schedule();
  };
  const stopDrag = (event: PointerEvent) => {
    drag = undefined;
    if (viewport.hasPointerCapture(event.pointerId))
      viewport.releasePointerCapture(event.pointerId);
  };
  viewport.onpointerup = stopDrag;
  viewport.onpointercancel = stopDrag;
  viewport.addEventListener(
    'wheel',
    (event) => {
      if (!active || !event.deltaY || state.status !== 'ready') return;
      event.preventDefault();
      if (options.zoomReference === 'relative-fit')
        handle.setScale(
          state.fitScale *
            Math.min(
              5,
              Math.max(
                0.1,
                Math.round(
                  (state.scale / state.fitScale +
                    (event.deltaY < 0 ? 0.1 : -0.1)) *
                    10,
                ) / 10,
              ),
            ),
        );
      else
        handle.setScale(
          Math.max(
            0.01,
            Math.min(5, state.scale * (event.deltaY < 0 ? 1.1 : 1 / 1.1)),
          ),
        );
    },
    { passive: false },
  );
  if (options.signal.aborted) await handle.dispose();
  else await load();
  return handle;
}
