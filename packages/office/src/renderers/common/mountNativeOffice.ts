import type { ViewContext, ViewHandle, ViewOptions } from '@filumo/dom';
import { useStyles as acquireStyles } from '@filumo/dom';
import { STYLE_SCOPE } from '../../generated/package';
import { createOfficeCapabilities } from '../../runtime/capabilities';
import { createOfficeViewServices } from '../../services/createOfficeViewServices';
import '../../styles/office.less';
import '../../styles/search.less';
import type { OfficeViewServices } from '../../view/contracts';
import type { OfficeRenderContext } from '../../view/types';
import { mountNativePanels } from './NativePanels';
import './native.less';
export interface NativeOfficeContext extends OfficeRenderContext {
  session: ViewContext['session'];
  options: ViewOptions;
  stage: HTMLElement;
}
/** 创建框架无关 Office 外壳和服务，格式视图只拥有 stage 内的文档节点。 */
export async function mountNativeOffice(
  context: ViewContext,
  mount: (context: NativeOfficeContext) => Promise<ViewHandle>,
): Promise<ViewHandle> {
  const document = context.container.ownerDocument,
    releaseStyle = acquireStyles('office', document, context.stylePolicy);
  const scope = document.createElement('div');
  scope.className = STYLE_SCOPE;
  scope.dataset.filumoOfficeRoot = 'true';
  scope.style.height = '100%';
  const root = document.createElement('div');
  root.className = 'office-file-viewer';
  scope.append(root);
  context.container.append(scope);
  const layout = document.createElement('div'),
    content = document.createElement('div'),
    workspace = document.createElement('div'),
    searchHost = document.createElement('aside'),
    reviewHost = document.createElement('aside'),
    stage = document.createElement('div'),
    notices = document.createElement('details'),
    summary = document.createElement('summary'),
    warningList = document.createElement('ul'),
    partial = document.createElement('div');
  layout.className = 'office-file-viewer__layout';
  content.className = 'office-file-viewer__content';
  workspace.className = 'office-file-viewer__workspace';
  searchHost.className = reviewHost.className = 'filumo-native-panel';
  stage.className = 'office-file-viewer__stage';
  notices.className = 'filumo-office-notices';
  partial.setAttribute('role', 'alert');
  notices.append(summary, warningList);
  workspace.append(searchHost, stage, reviewHost);
  // 正常溢出由滚动条表达，公共外壳只呈现实际解析告警。
  content.append(workspace, partial, notices);
  layout.append(content);
  root.append(layout);
  let services: OfficeViewServices | undefined, view: ViewHandle | undefined;
  let options = { ...context.options };
  let closed = false;
  let active = true;
  const activeListeners = new Set<(value: boolean) => void>();
  const stops: Array<() => void> = [];
  try {
    services = createOfficeViewServices(context);
    const owned = services;
    const panels = mountNativePanels(
      searchHost,
      reviewHost,
      owned,
      context.onError,
    );
    stops.push(() => panels.dispose());
    const native: NativeOfficeContext = {
      document,
      container: root,
      stage,
      services: owned,
      signal: context.session.signal,
      session: context.session,
      locale: options.locale,
      stylePolicy: context.stylePolicy,
      isActive: () => active,
      onActiveChange: (listener) => {
        activeListeners.add(listener);
        return () => {
          activeListeners.delete(listener);
        };
      },
      onError: context.onError,
      options,
    };
    const refresh = () => {
      if (closed) return;
      root.dataset.officeTheme = options.theme ?? 'light';
      context.setCapabilities(
        createOfficeCapabilities(owned.state, options.locale),
      );
      const warnings = owned.warnings.getSnapshot().items;
      notices.hidden = !warnings.length;
      summary.textContent =
        (options.locale === 'en-US' ? 'Preview notices' : '预览提示') +
        ' (' +
        warnings.length +
        ')';
      warningList.replaceChildren(
        ...warnings.map((warning) => {
          const item = document.createElement('li');
          item.textContent = warning.message;
          return item;
        }),
      );
      const state = context.session.getSnapshot();
      partial.hidden = state.status !== 'error' || !state.partialReady;
      partial.textContent = partial.hidden
        ? ''
        : options.locale === 'en-US'
        ? 'Only part of the document is available'
        : '解析未完成，当前显示已读取的部分内容';
    };
    stops.push(
      owned.state.subscribe(refresh),
      owned.warnings.subscribe(refresh),
      context.session.subscribe(refresh),
    );
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && owned.state.getState().showSearch) {
        event.preventDefault();
        void owned.state.execute({ type: 'search', open: false });
      }
    });
    // 演示文稿默认完整适配容器，宿主显式传入比例时仍优先使用固定缩放。
    if (
      options.zoom === undefined &&
      owned.state.getState().family === 'presentation'
    ) {
      await owned.state.execute({ type: 'zoomMode', mode: 'fit-page' });
    } else {
      await owned.state.execute({ type: 'zoom', value: options.zoom ?? 100 });
    }
    panels.update(options.locale ?? 'zh-CN');
    view = await mount(native);
    refresh();
    const handle: ViewHandle = {
      update(next) {
        options = { ...options, ...next };
        native.options = options;
        native.locale = options.locale;
        panels.update(options.locale ?? 'zh-CN');
        if (next.zoom !== undefined)
          void owned.state
            .execute({ type: 'zoom', value: next.zoom })
            .catch(context.onError);
        view?.update(options);
        refresh();
      },
      setActive(value) {
        active = value;
        for (const listener of activeListeners) listener(value);
        owned.setActive(value);
        scope.hidden = !value;
        view?.setActive(value);
      },
      async dispose() {
        if (closed) return;
        closed = true;
        activeListeners.clear();
        // 回调注册后才调用，此时所引用的节点/句柄已初始化。
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        context.session.signal.removeEventListener('abort', onAbort);
        stops.forEach((stop) => stop());
        try {
          await view?.dispose();
        } finally {
          try {
            await owned.dispose();
          } finally {
            scope.remove();
            releaseStyle();
          }
        }
      },
    };
    const onAbort = () => {
      void handle.dispose().catch(context.onError);
    };
    context.session.signal.addEventListener('abort', onAbort, { once: true });
    if (context.session.signal.aborted) {
      await handle.dispose();
      throw context.session.signal.reason;
    }
    return handle;
  } catch (error) {
    closed = true;
    stops.forEach((stop) => stop());
    try {
      await view?.dispose();
    } finally {
      try {
        await services?.dispose();
      } finally {
        scope.remove();
        releaseStyle();
      }
    }
    throw error;
  }
}
