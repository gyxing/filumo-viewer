import { useStyles } from '@filumo/dom';
import { STYLE_SCOPE } from '../generated/package';
import { mountImageSurface } from './ImageSurface';
import { getImageFileName } from './imageName';
import './overlay.less';
import type {
  ImageModel,
  ImageOverlayHandle,
  ImageOverlayOptions,
  ImageSurfaceHandle,
} from './types';

const ICONS: Record<string, string> = {
  out: 'M4 12h16',
  inside: 'M4 12h16M12 4v16',
  rotate: 'M20 9a8 8 0 1 0 0 7M20 3v6h-6',
  reset: 'M4 9a8 8 0 1 1 0 7M4 3v6h6',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  close: 'M5 5l14 14M19 5 5 19',
};
// 容忍点击时的轻微手抖；一旦超过阈值，即使回到起点也视为拖动。
const CLICK_MOVE_TOLERANCE = 4;

/** 图片弹层只负责弹层交互，Surface 及资源租约由自身实例统一释放。 */
export async function mountImageOverlay(
  host: HTMLElement,
  model: ImageModel,
  initial: ImageOverlayOptions,
): Promise<ImageOverlayHandle> {
  const document = host.ownerDocument,
    releaseStyles = useStyles('image', document, initial.stylePolicy);
  const scope = document.createElement('div');
  scope.className = STYLE_SCOPE!;
  const overlay = document.createElement('section'),
    toolbar = document.createElement('div'),
    title = document.createElement('strong'),
    controls = document.createElement('div'),
    body = document.createElement('div');
  overlay.className = 'filumo-image-preview';
  toolbar.className = 'filumo-image-preview-toolbar';
  title.className = 'filumo-image-preview-title';
  controls.className = 'filumo-image-preview-controls';
  body.className = 'filumo-image-preview-viewport';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  toolbar.setAttribute('role', 'toolbar');
  const fileName = getImageFileName(model),
    extension = fileName.match(/\.[a-z0-9]{2,6}$/i)?.[0] ?? '';
  const name = document.createElement('span'),
    suffix = document.createElement('span');
  name.className = 'filumo-image-preview-title-name';
  suffix.className = 'filumo-image-preview-title-extension';
  name.textContent = extension
    ? fileName.slice(0, -extension.length)
    : fileName;
  suffix.textContent = extension;
  title.title = fileName;
  title.append(name, suffix);
  toolbar.append(title, controls);
  overlay.append(toolbar, body);
  scope.append(overlay);
  host.append(scope);
  const siblings = Array.from(host.children).filter(
    (node) => node !== scope,
  ) as HTMLElement[];
  const inert = siblings.map((node) => node.inert);
  siblings.forEach((node) => {
    node.inert = true;
  });
  const abort = new AbortController();
  let options = initial,
    surface: ImageSurfaceHandle | undefined,
    closed = false,
    unsubscribe: (() => void) | undefined,
    disposing: Promise<void> | undefined;
  let close = () => {};
  let gesture:
    | {
        id: number;
        x: number;
        y: number;
        blank: boolean;
        moved: boolean;
        released: boolean;
      }
    | undefined;
  let removeGestures = () => {};
  const labels: Array<{ button: HTMLButtonElement; zh: string; en: string }> =
    [];
  const label = () => {
    const en = options.locale === 'en-US';
    overlay.setAttribute('aria-label', en ? 'Image preview' : '图片预览');
    toolbar.setAttribute('aria-label', en ? 'Image controls' : '图片工具栏');
    for (const item of labels) {
      item.button.title = en ? item.en : item.zh;
      item.button.setAttribute('aria-label', item.button.title);
    }
    surface?.update({ locale: options.locale });
  };
  const dispose = (): Promise<void> => {
    if (disposing) return disposing;
    closed = true;
    gesture = undefined;
    removeGestures();
    abort.abort();
    unsubscribe?.();
    options.signal.removeEventListener('abort', close);
    scope.remove();
    siblings.forEach((node, i) => {
      node.inert = inert[i];
    });
    if (options.trigger?.isConnected)
      options.trigger.focus({ preventScroll: true });
    releaseStyles();
    disposing = Promise.resolve().then(() => surface?.dispose());
    return disposing;
  };
  close = () => {
    void dispose().catch(() => undefined);
  };
  const button = (icon: string, zh: string, en: string, run: () => void) => {
    const node = document.createElement('button');
    node.type = 'button';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
      path = document.createElementNS(svg.namespaceURI, 'path');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('aria-hidden', 'true');
    path.setAttribute('d', ICONS[icon]);
    svg.append(path);
    node.append(svg);
    node.onclick = run;
    labels.push({ button: node, zh, en });
    controls.append(node);
    return node;
  };
  const change = (delta: number) => {
    if (!surface) return;
    const state = surface.getSnapshot(),
      base = options.zoomReference === 'relative-fit' ? state.fitScale : 1;
    surface.setScale(
      base *
        Math.min(
          5,
          Math.max(0.1, Math.round((state.scale / base + delta) * 10) / 10),
        ),
    );
  };
  button('out', '缩小', 'Zoom out', () => change(-0.1));
  const percent = document.createElement('output');
  percent.textContent = '100%';
  controls.append(percent);
  button('inside', '放大', 'Zoom in', () => change(0.1));
  button('rotate', '旋转', 'Rotate', () => surface?.rotate());
  button('reset', '复位', 'Reset', () => surface?.reset());
  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  overlay.append(status);
  if (model.download) {
    const download = button('download', '下载图片', 'Download image', () => {
      download.disabled = true;
      void model.download!(abort.signal)
        .catch((error) => {
          if (!closed) status.textContent = String(error);
        })
        .finally(() => {
          if (!closed) download.disabled = false;
        });
    });
  }
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'filumo-image-preview-retry';
  retry.textContent = options.locale === 'en-US' ? 'Retry' : '重试';
  retry.hidden = true;
  retry.onclick = () => {
    void surface?.retry();
  };
  controls.append(retry);
  const closeButton = button('close', '关闭', 'Close', close);
  overlay.onkeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      const available = Array.from(controls.querySelectorAll('button')).filter(
        (node) => !node.disabled && !node.hidden,
      );
      if (event.shiftKey && document.activeElement === available[0]) {
        event.preventDefault();
        available.at(-1)?.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === available.at(-1)
      ) {
        event.preventDefault();
        available[0]?.focus();
      }
    }
  };
  const isBlank = (target: EventTarget | null): boolean =>
    target === body ||
    (!!target &&
      body.contains(target as Node) &&
      !!(target as Element).classList?.contains('filumo-image-surface'));
  const startPointer = (event: PointerEvent) => {
    gesture = undefined;
    if (closed || overlay.hidden || event.button !== 0 || !event.isPrimary)
      return;
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      blank: isBlank(event.target),
      moved: false,
      released: false,
    };
  };
  const movePointer = (event: PointerEvent) => {
    if (!gesture || gesture.id !== event.pointerId || gesture.released) return;
    if (
      Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) >
      CLICK_MOVE_TOLERANCE
    )
      gesture.moved = true;
  };
  const endPointer = (event: PointerEvent) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    movePointer(event);
    gesture.released = true;
    // 捕获中的 pointerup 目标可能已变成视口，实际落点必须重新命中测试。
    gesture.blank =
      gesture.blank &&
      isBlank(document.elementFromPoint(event.clientX, event.clientY));
  };
  const cancelPointer = (event: PointerEvent) => {
    if (gesture?.id === event.pointerId) gesture = undefined;
  };
  const lostPointer = (event: PointerEvent) => {
    // 正常 pointerup 后也会释放捕获，需保留结果供随后产生的 click 消费。
    if (gesture?.id === event.pointerId && !gesture.released)
      gesture = undefined;
  };
  // 捕获阶段保留原始按下目标，先于 Surface 的 setPointerCapture 执行。
  overlay.addEventListener('pointerdown', startPointer, true);
  overlay.addEventListener('pointermove', movePointer, true);
  overlay.addEventListener('pointerup', endPointer, true);
  overlay.addEventListener('pointercancel', cancelPointer, true);
  overlay.addEventListener('lostpointercapture', lostPointer, true);
  removeGestures = () => {
    overlay.removeEventListener('pointerdown', startPointer, true);
    overlay.removeEventListener('pointermove', movePointer, true);
    overlay.removeEventListener('pointerup', endPointer, true);
    overlay.removeEventListener('pointercancel', cancelPointer, true);
    overlay.removeEventListener('lostpointercapture', lostPointer, true);
    body.onclick = null;
  };
  body.onclick = (event) => {
    const completed = gesture;
    gesture = undefined;
    if (
      closed ||
      overlay.hidden ||
      event.button !== 0 ||
      !completed?.released ||
      completed.moved ||
      !completed.blank ||
      !isBlank(event.target)
    )
      return;
    const pointerId = (event as PointerEvent).pointerId;
    if (typeof pointerId === 'number' && pointerId !== completed.id) return;
    close();
  };
  options.signal.addEventListener('abort', close, { once: true });
  label();
  if (options.signal.aborted) await dispose();
  else {
    try {
      const mounted = await mountImageSurface(body, model, {
        ...options,
        signal: abort.signal,
      });
      if (closed) await mounted.dispose();
      else {
        surface = mounted;
        const update = () => {
          const state = mounted.getSnapshot();
          percent.textContent =
            Math.round(
              (state.scale /
                (options.zoomReference === 'relative-fit'
                  ? state.fitScale
                  : 1)) *
                100,
            ) + '%';
          retry.hidden = state.status !== 'error';
        };
        unsubscribe = mounted.subscribe(update);
        update();
        closeButton.focus();
      }
    } catch (error) {
      await dispose();
      throw error;
    }
  }
  return {
    update(next) {
      options = { ...options, ...next };
      retry.textContent = options.locale === 'en-US' ? 'Retry' : '重试';
      label();
    },
    setActive(value) {
      if (!value) gesture = undefined;
      overlay.hidden = !value;
      surface?.setActive(value);
    },
    dispose,
  };
}
