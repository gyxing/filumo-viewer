import { STYLE_SCOPE } from '../../generated/package';
import { setOfficeIconButton, type OfficeUiIcon } from '../ui';
import {
  downloadOfficeImage,
  getOfficeImageDownloadName,
} from '../../shared/image-preview/downloadOfficeImage';
import {
  OFFICE_IMAGE_PREVIEW_MAX_ZOOM,
  OFFICE_IMAGE_PREVIEW_MIN_ZOOM,
  OFFICE_IMAGE_PREVIEW_ZOOM_STEP,
  calculateOfficeImageFitScale,
  normalizeOfficeImagePreviewZoom,
} from '../../shared/image-preview/imagePreviewTransform';
import type { OfficeRenderContext } from '../types';
import { mountImage, type ImageViewModel } from './mountImage';
import './shared.less';
export interface ImagePreviewModel extends ImageViewModel {
  id?: string;
  name?: string;
  mimeType?: string;
  download?: boolean;
}
let sequence = 0;
/** 原生图片弹层复用原缩放算法，支持拖拽、旋转、复位、重试与下载，并独立持有资源租约。 */
export async function mountImagePreview(
  model: ImagePreviewModel,
  trigger: HTMLElement,
  context: OfficeRenderContext,
) {
  const document = context.document,
    en = context.locale === 'en-US',
    overlay = document.createElement('div'),
    toolbar = document.createElement('div'),
    viewport = document.createElement('div'),
    status = document.createElement('div');
  overlay.className = 'fivo-image-preview';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', en ? 'Image preview' : '图片预览');
  toolbar.className = 'fivo-image-preview-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', en ? 'Image controls' : '图片工具栏');
  const title = document.createElement('strong');
  title.className = 'fivo-image-preview-title';
  // 标题复用下载命名规则，已有后缀不重复添加，缺失时按资源格式补齐。
  const fileName = getOfficeImageDownloadName({
    ...model,
    id: model.id ?? 'image',
  });
  // 后缀识别与下载规则一致，只对文件名主体做视觉省略。
  const extension = fileName.match(/\.[a-z0-9]{2,6}$/i)?.[0] ?? '';
  const name = document.createElement('span');
  name.className = 'fivo-image-preview-title-name';
  name.textContent = extension
    ? fileName.slice(0, -extension.length)
    : fileName;
  const suffix = document.createElement('span');
  suffix.className = 'fivo-image-preview-title-extension';
  suffix.textContent = extension;
  title.append(name, suffix);
  title.title = fileName;
  const controls = document.createElement('div');
  controls.className = 'fivo-image-preview-controls';
  toolbar.append(title, controls);
  viewport.className = 'fivo-image-preview-viewport';
  status.setAttribute('role', 'status');
  overlay.append(toolbar, viewport, status);
  // 默认外壳内覆盖工具栏与内容；独立视图挂载时仍限制在调用方容器内。
  const modalHost =
    context.container.closest<HTMLElement>('.fivo-viewer') ?? context.container;
  // 弹层移出 Office 内容区后仍需独立的版本作用域，不能污染通用外壳或其他版本。
  const scope = document.createElement('div');
  scope.className = STYLE_SCOPE;
  scope.append(overlay);
  modalHost.append(scope);
  const siblings = Array.from(modalHost.children).filter(
    (node) => node !== scope,
  ) as HTMLElement[];
  const inertBefore = siblings.map((node) => node.inert);
  siblings.forEach((node) => {
    node.inert = true;
  });
  const abort = new AbortController();
  const key = 'image-preview-' + ++sequence;
  let closed = false,
    zoom = 1,
    rotation = 0,
    x = 0,
    y = 0,
    downloading = false;
  let image: HTMLImageElement | undefined;
  let imageView: Awaited<ReturnType<typeof mountImage>> | undefined;
  let resize: ResizeObserver | undefined;
  let cancelLayout: (() => void) | undefined;
  let drag: { id: number; x: number; y: number } | undefined;
  const makeButton = (
    label: string,
    action: () => void,
    icon?: OfficeUiIcon,
  ) => {
    const button = document.createElement('button');
    button.type = 'button';
    if (icon) setOfficeIconButton(button, label, icon);
    else button.textContent = label;
    button.onclick = action;
    controls.append(button);
    return button;
  };
  const transform = () => {
    if (closed || !image) return;
    cancelLayout = context.services.layout.schedule(
      key,
      () => ({
        width: viewport.clientWidth,
        height: viewport.clientHeight,
        naturalWidth: image!.naturalWidth,
        naturalHeight: image!.naturalHeight,
      }),
      (size) => {
        if (closed || !image) return;
        const fit = calculateOfficeImageFitScale(
          size.naturalWidth,
          size.naturalHeight,
          Math.max(0, size.width - 48),
          Math.max(0, size.height - 48),
          rotation,
        );
        image.style.width = size.naturalWidth + 'px';
        image.style.height = size.naturalHeight + 'px';
        image.style.visibility = size.naturalWidth ? 'visible' : 'hidden';
        image.style.transform =
          'translate(-50%, -50%) translate3d(' +
          x +
          'px, ' +
          y +
          'px, 0) rotate(' +
          rotation +
          'deg) scale(' +
          fit * zoom +
          ')';
        // 回调注册后才调用，此时所引用的节点/句柄已初始化。
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        zoomLabel.textContent = Math.round(zoom * 100) + '%';
        // 回调注册后才调用，此时所引用的节点/句柄已初始化。
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        out.disabled = zoom <= OFFICE_IMAGE_PREVIEW_MIN_ZOOM;
        // 回调注册后才调用，此时所引用的节点/句柄已初始化。
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        inside.disabled = zoom >= OFFICE_IMAGE_PREVIEW_MAX_ZOOM;
      },
    );
  };
  const change = (delta: number) => {
    zoom = normalizeOfficeImagePreviewZoom(zoom + delta);
    transform();
  };
  const out = makeButton(
    en ? 'Zoom out' : '缩小',
    () => change(-OFFICE_IMAGE_PREVIEW_ZOOM_STEP),
    'zoomOut',
  );
  const zoomLabel = document.createElement('output');
  zoomLabel.textContent = '100%';
  zoomLabel.setAttribute('aria-label', en ? 'Zoom percentage' : '缩放比例');
  controls.append(zoomLabel);
  const inside = makeButton(
    en ? 'Zoom in' : '放大',
    () => change(OFFICE_IMAGE_PREVIEW_ZOOM_STEP),
    'zoomIn',
  );
  makeButton(
    en ? 'Rotate' : '旋转',
    () => {
      rotation = (rotation + 90) % 360;
      x = 0;
      y = 0;
      transform();
    },
    'rotate',
  );
  makeButton(
    en ? 'Reset' : '复位',
    () => {
      zoom = 1;
      rotation = 0;
      x = 0;
      y = 0;
      transform();
    },
    'reset',
  );
  if (model.download !== false)
    makeButton(
      en ? 'Download' : '下载图片',
      () => {
        if (!image?.src || downloading) return;
        downloading = true;
        void downloadOfficeImage(
          image.src,
          {
            id: model.id ?? 'image',
            name: model.name,
            alt: model.alt,
            mimeType: model.mimeType,
            source: model.source,
          },
          document,
        )
          .catch((error) => {
            if (!closed) status.textContent = String(error);
          })
          .finally(() => {
            downloading = false;
          });
      },
      'download',
    );
  const dispose = () => {
    if (closed) return;
    closed = true;
    abort.abort();
    cancelLayout?.();
    resize?.disconnect();
    context.signal.removeEventListener('abort', dispose);
    void imageView?.dispose();
    scope.remove();
    siblings.forEach((node, index) => {
      node.inert = inertBefore[index];
    });
    if (trigger.isConnected) trigger.focus();
  };
  const close = makeButton(en ? 'Close' : '关闭', dispose, 'close');
  const failure = (error: unknown) => {
    if (!closed) {
      status.textContent =
        (en ? 'Image loading failed: ' : '图片加载失败：') + String(error);
      // 失败回调只在重试按钮初始化、开始加载后执行。
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      retry.hidden = false;
    }
  };
  const retry = makeButton(en ? 'Retry' : '重试', () => {
    retry.disabled = true;
    void load()
      .catch(failure)
      .finally(() => {
        if (!closed) retry.disabled = false;
      });
  });
  retry.hidden = true;

  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dispose();
      return;
    }
    if (event.key === 'Tab') {
      const buttons = Array.from(toolbar.querySelectorAll('button')).filter(
        (button) => !button.disabled && !button.hidden,
      );
      if (event.shiftKey && document.activeElement === buttons[0]) {
        event.preventDefault();
        buttons.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
        event.preventDefault();
        buttons[0]?.focus();
      }
    }
  });
  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target !== image || !image.naturalWidth)
      return;
    image.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  viewport.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    x += event.clientX - drag.x;
    y += event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    transform();
  });
  const stopDrag = (event: PointerEvent) => {
    if (drag?.id !== event.pointerId) return;
    drag = undefined;
    if (image?.hasPointerCapture(event.pointerId))
      image.releasePointerCapture(event.pointerId);
  };
  viewport.addEventListener('pointerup', stopDrag);
  viewport.addEventListener('pointercancel', stopDrag);
  viewport.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      if (event.deltaY)
        change(
          event.deltaY < 0
            ? OFFICE_IMAGE_PREVIEW_ZOOM_STEP
            : -OFFICE_IMAGE_PREVIEW_ZOOM_STEP,
        );
    },
    { passive: false },
  );
  viewport.addEventListener('click', (event) => {
    if (event.target === viewport) dispose();
  });
  context.signal.addEventListener('abort', dispose, { once: true });
  if (context.signal.aborted) dispose();
  let loadVersion = 0;
  async function load() {
    const token = ++loadVersion;
    await imageView?.dispose();
    imageView = undefined;
    status.textContent = en ? 'Loading' : '正在加载';
    const loaded = await mountImage(viewport, model, {
      ...context,
      signal: abort.signal,
    });
    if (closed || token !== loadVersion) {
      await loaded.dispose();
      return;
    }
    imageView = loaded;
    image = viewport.querySelector('img')!;
    image.loading = 'eager';
    image.draggable = false;
    image.ondragstart = (event) => event.preventDefault();
    image.onload = () => {
      status.textContent = '';
      retry.hidden = true;
      transform();
    };
    image.onerror = () => failure(en ? 'Image decode failed' : '图片解码失败');
    if (image.complete && image.naturalWidth) {
      status.textContent = '';
      retry.hidden = true;
      transform();
    }
  }
  try {
    await load();
    if (closed) return { dispose };
    const Resize = document.defaultView?.ResizeObserver;
    if (Resize) {
      resize = new Resize(transform);
      resize.observe(viewport);
    }
    close.focus();
  } catch (error) {
    if (!closed) {
      failure(error);
      close.focus();
    }
  }

  return { dispose };
}
