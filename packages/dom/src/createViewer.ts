import type { DocumentInput, DocumentOpenOptions } from '@fivo/core';
import {
  abortError,
  createDocumentController,
  exportOriginal,
  notify,
} from '@fivo/core';
import type { ViewerCapabilities } from './capabilities/types';
import type {
  ViewHandle,
  ViewOptions,
  ViewerHandle,
  ViewerOptions,
} from './contracts';
import './shell.less';
import { bindCapabilities } from './shell/bindCapabilities';
import { labelShellButton, updateFileIcon } from './shell/icons';
import { createViewerStatus } from './shell/status';
import { useStyles as acquireStyles } from './styles';

/** 创建独立预览器；格式能力由插件提供，外壳只负责通用展示和生命周期。 */
export function createViewer(
  container: HTMLElement,
  options: ViewerOptions,
): ViewerHandle {
  const document = container.ownerDocument;
  const controller = createDocumentController({
    plugins: options.plugins.map((plugin) => plugin.document),
    baseUrl: document.baseURI,
    resourcePolicy: options.resourcePolicy,
    pluginId: options.pluginId,
  });
  const releaseStyles = acquireStyles('dom', document, options.stylePolicy);
  const root = document.createElement('section');
  root.className = 'fivo-viewer';
  const toolbar = document.createElement('div');
  toolbar.className = 'fivo-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  const fileTitle = document.createElement('div');
  fileTitle.className = 'fivo-file-title';
  const fileIcon = document.createElement('span');
  fileIcon.className = 'fivo-file-icon';
  fileIcon.setAttribute('aria-hidden', 'true');
  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'fivo-open-file';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  // 文件选择器仅提示已注册插件支持的扩展名，内容检测仍由控制器负责。
  fileInput.accept = Array.from(
    new Set(options.plugins.flatMap((plugin) => plugin.document.extensions)),
  ).join(',');
  fileInput.hidden = true;
  fileInput.tabIndex = -1;
  const pickFile = () => {
    fileInput.value = '';
    fileInput.click();
  };
  openButton.onclick = pickFile;
  const title = document.createElement('span');
  title.className = 'fivo-title';
  fileTitle.append(fileIcon, title);
  const controls = document.createElement('div');
  controls.className = 'fivo-controls';
  const download = document.createElement('button');
  download.type = 'button';
  const fullscreen = document.createElement('button');
  fullscreen.type = 'button';
  const status = document.createElement('div');
  status.className = 'fivo-status';
  status.setAttribute('role', 'status');
  const progressBox = document.createElement('div');
  progressBox.className = 'fivo-progress';
  progressBox.setAttribute('role', 'status');
  const progressHeading = document.createElement('div');
  progressHeading.className = 'fivo-progress-heading';
  const progressLabel = document.createElement('span');
  progressLabel.className = 'fivo-progress-label';
  const progressValue = document.createElement('span');
  progressValue.className = 'fivo-progress-value';
  const progressBar = document.createElement('progress');
  progressBar.max = 100;
  progressHeading.append(progressLabel, progressValue);
  progressBox.append(progressHeading, progressBar);
  const retry = document.createElement('button');
  retry.type = 'button';
  const renderStatus = createViewerStatus(status, retry, pickFile);
  const viewport = document.createElement('div');
  viewport.className = 'fivo-viewport';
  // 内容区始终占据剩余空间，进度浮层显隐不参与文档视口的高度计算。
  const body = document.createElement('div');
  body.className = 'fivo-viewer-body';
  body.append(status, viewport, progressBox);
  toolbar.append(fileTitle, openButton, controls, download, fullscreen);
  root.append(toolbar, body, fileInput);
  container.append(root);
  let viewOptions: ViewOptions = { ...options };
  let view: ViewHandle | undefined;
  let generation = 0;
  let disposed = false;
  let active = true;
  let downloading = false;
  let lastInput: DocumentInput | undefined;
  let lastSelection: DocumentOpenOptions | undefined;
  let destroying: Promise<void> | undefined;
  let capabilities: ViewerCapabilities = {};
  const capabilityListeners = new Set<() => void>();
  const downloadLeases = new Set<() => void>();
  const report = (cause: unknown) => {
    if (disposed) return;
    const error = cause instanceof Error ? cause : new Error(String(cause));
    status.hidden = false;
    renderStatus(
      'error',
      viewOptions.locale === 'en-US',
      lastInput !== undefined,
      controller.getSnapshot().status === 'ready',
      error.message,
    );
    try {
      options.onError?.(error);
    } catch {
      /* 外部回调不能破坏资源清理。 */
    }
  };
  const bindings = bindCapabilities(controls, report);
  const publish = (next: ViewerCapabilities) => {
    capabilities = next;
    bindings.update(
      next,
      viewOptions.locale,
      controller.getSnapshot().status === 'ready' && active,
    );
    notify(capabilityListeners);
    try {
      options.onCapabilitiesChange?.(next);
    } catch {
      /* 观察者不拥有当前能力状态。 */
    }
  };
  const refresh = () => {
    const snapshot = controller.getSnapshot();
    const en = viewOptions.locale === 'en-US';
    title.textContent =
      snapshot.session?.source.name ?? (en ? 'Document preview' : '文档预览');
    title.title = title.textContent;
    updateFileIcon(fileIcon, snapshot.session?.source.name);
    root.dataset.state = snapshot.status;
    toolbar.setAttribute('aria-label', en ? 'Document toolbar' : '文档工具栏');
    labelShellButton(openButton, en ? 'Open file' : '打开文件', 'open');
    root.dataset.theme = viewOptions.theme ?? 'light';
    toolbar.hidden = viewOptions.toolbar === false;
    root.style.height =
      typeof viewOptions.height === 'number'
        ? viewOptions.height + 'px'
        : viewOptions.height ?? '560px';
    labelShellButton(
      download,
      en ? 'Download original' : '下载原文件',
      'download',
      true,
    );
    download.disabled = snapshot.status !== 'ready' || downloading;
    const isFullscreen = document.fullscreenElement === root;
    labelShellButton(
      fullscreen,
      isFullscreen
        ? en
          ? 'Exit fullscreen'
          : '退出全屏'
        : en
        ? 'Fullscreen'
        : '全屏',
      isFullscreen ? 'exitFullscreen' : 'fullscreen',
      true,
    );
    fullscreen.hidden = typeof root.requestFullscreen !== 'function';
    retry.textContent = en ? 'Retry' : '重试';
    root.setAttribute(
      'aria-busy',
      String(snapshot.status === 'loading' || snapshot.status === 'detecting'),
    );
    const progress = snapshot.progress;
    progressBox.hidden =
      !progress ||
      snapshot.status === 'error' ||
      snapshot.status === 'cancelled';
    const percentage =
      progress?.total && progress.loaded !== undefined
        ? Math.max(0, Math.min(100, (progress.loaded / progress.total) * 100))
        : undefined;
    progressLabel.textContent = progress?.phase ?? '';
    progressLabel.title = progressLabel.textContent;
    // 无可靠总量时保留不定进度，避免阶段文字旁出现虚假的百分比。
    const hasPercentage =
      percentage !== undefined && Number.isFinite(percentage);
    progressValue.textContent = hasPercentage ? Math.round(percentage) + '%' : '';
    progressValue.hidden = !hasPercentage;
    progressBar.setAttribute(
      'aria-label',
      en ? 'Document loading progress' : '文档加载进度',
    );
    if (!hasPercentage) progressBar.removeAttribute('value');
    else progressBar.value = percentage;
    status.hidden =
      snapshot.status === 'ready' ||
      (Boolean(progress) && snapshot.status !== 'error');
    status.setAttribute(
      'role',
      snapshot.status === 'error' ? 'alert' : 'status',
    );
    renderStatus(
      snapshot.status,
      en,
      lastInput !== undefined,
      false,
      snapshot.error?.message,
    );
    bindings.update(
      capabilities,
      viewOptions.locale,
      snapshot.status === 'ready' && active,
    );
    try {
      options.onStateChange?.(snapshot);
    } catch {
      /* 外部观察者异常不影响查看器。 */
    }
  };
  const unsubscribe = controller.subscribe(refresh);
  refresh();
  const releaseView = async () => {
    const previous = view;
    view = undefined;
    publish({});
    viewport.replaceChildren();
    await previous?.dispose();
  };
  const handle: ViewerHandle = {
    async open(input, selection) {
      if (disposed) throw new Error('查看器已释放');
      lastInput = input;
      lastSelection = selection;
      const task = ++generation;
      try {
        await releaseView();
        if (generation !== task || disposed) throw abortError();
        await controller.open(input, selection);
        if (generation !== task || disposed) throw abortError();
        const snapshot = controller.getSnapshot();
        const plugin = options.plugins.find(
          (item) => item.document.id === snapshot.pluginId,
        );
        if (!plugin || !snapshot.session)
          throw new Error('文档插件没有交付会话');
        const factory = await plugin.loadView();
        if (generation !== task || disposed) throw abortError();
        const mount = document.createElement('div');
        mount.className = 'fivo-document-mount';
        viewport.replaceChildren(mount);
        const mounted = await factory.mount({
          container: mount,
          session: snapshot.session,
          options: viewOptions,
          stylePolicy: options.stylePolicy,
          onError(cause) {
            if (task === generation && !disposed) report(cause);
          },
          setCapabilities(next) {
            if (task === generation && !disposed) publish(next);
          },
        });
        if (generation !== task || disposed) {
          await mounted.dispose();
          throw abortError();
        }
        view = mounted;
        view.setActive(active);
        refresh();
        try {
          options.onReady?.(snapshot.session);
        } catch {
          /* 不让就绪观察者打断交付。 */
        }
      } catch (cause) {
        if (
          task === generation &&
          !disposed &&
          !(cause instanceof Error && cause.name === 'AbortError')
        )
          report(cause);
        throw cause;
      }
    },
    update(next) {
      viewOptions = { ...viewOptions, ...next };
      refresh();
      view?.update(viewOptions);
    },
    setActive(value) {
      active = value;
      view?.setActive(value);
      refresh();
    },
    getSnapshot: controller.getSnapshot,
    subscribe: controller.subscribe,
    getCapabilities: () => capabilities,
    subscribeCapabilities(listener) {
      if (disposed) return () => undefined;
      capabilityListeners.add(listener);
      return () => {
        capabilityListeners.delete(listener);
      };
    },
    destroy() {
      if (destroying) return destroying;
      disposed = true;
      generation++;
      unsubscribe();
      destroying = (async () => {
        let error: unknown;
        try {
          await releaseView();
        } catch (cause) {
          error = cause;
        }
        try {
          await controller.destroy();
        } catch (cause) {
          error ??= cause;
        } finally {
          for (const release of downloadLeases) release();
          bindings.dispose();
          document.removeEventListener('fullscreenchange', refresh);
          capabilityListeners.clear();
          root.remove();
          releaseStyles();
          lastInput = undefined;
        }
        if (error) throw error;
      })();
      return destroying;
    },
  };
  document.addEventListener('fullscreenchange', refresh);
  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    if (file) void handle.open(file).catch(() => undefined);
  };
  retry.onclick = () => {
    if (lastInput !== undefined)
      void handle.open(lastInput, lastSelection).catch(() => undefined);
  };
  fullscreen.onclick = () => {
    void (
      document.fullscreenElement === root
        ? document.exitFullscreen()
        : root.requestFullscreen()
    ).catch(report);
  };
  download.onclick = () => {
    const session = controller.getSnapshot().session;
    if (!session || downloading) return;
    downloading = true;
    refresh();
    void exportOriginal(session.source, session.signal)
      .then((file) => {
        if (disposed || controller.getSnapshot().session !== session)
          throw abortError();
        const window = document.defaultView;
        if (!window) throw new Error('此文档没有下载窗口');
        const url = window.URL.createObjectURL(
          new window.Blob([file.bytes], { type: file.mimeType }),
        );
        const release = () => {
          window.URL.revokeObjectURL(url);
          // 回调注册后才调用，此时所引用的节点/句柄已初始化。
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          downloadLeases.delete(cancel);
        };
        const timer = window.setTimeout(release, 1000);
        const cancel = () => {
          window.clearTimeout(timer);
          release();
        };
        downloadLeases.add(cancel);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name ?? 'document';
        link.hidden = true;
        root.append(link);
        try {
          link.click();
        } finally {
          link.remove();
        }
      })
      .catch((error) => {
        if (!(error instanceof Error && error.name === 'AbortError'))
          report(error);
      })
      .finally(() => {
        downloading = false;
        if (!disposed) refresh();
      });
  };
  root.addEventListener('keydown', (event) => {
    if (
      !event.defaultPrevented &&
      active &&
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 'f' &&
      capabilities.search
    ) {
      event.preventDefault();
      void capabilities.search
        .setQuery(capabilities.search.query)
        .catch(report);
    }
  });
  return handle;
}
