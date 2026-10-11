import type { ViewContext, ViewHandle, ViewOptions } from '@fivo/dom';
import { useStyles as acquireStyles } from '@fivo/dom';
import { STYLE_SCOPE } from '../../generated/package';
import { createOfficeCapabilities } from '../../runtime/capabilities';
import type { OfficeViewServices } from '../../view/contracts';
import { createOfficeViewServices } from '../../services/createOfficeViewServices';
import '../../styles/office.less';
import '../../styles/search.less';
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
  scope.dataset.fivoOfficeRoot = 'true';
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
    overflow = document.createElement('div'),
    partial = document.createElement('div');
  layout.className = 'office-file-viewer__layout';
  content.className = 'office-file-viewer__content';
  workspace.className = 'office-file-viewer__workspace';
  searchHost.className = reviewHost.className = 'fivo-native-panel';
  stage.className = 'office-file-viewer__stage';
  notices.className = 'fivo-office-notices';
  overflow.className = 'office-file-overflow-notice';
  overflow.setAttribute('role', 'status');
  partial.setAttribute('role', 'alert');
  notices.append(summary, warningList);
  workspace.append(searchHost, stage, reviewHost);
  content.append(workspace, overflow, partial, notices);
  layout.append(content);
  root.append(layout);
  let services: OfficeViewServices | undefined, view: ViewHandle | undefined;
  let options = { ...context.options };
  let closed = false;
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
      const axis = owned.viewport.getSnapshot().overflowAxis;
      overflow.hidden = !axis;
      overflow.textContent = axis
        ? options.locale === 'en-US'
          ? 'Scroll to see the remaining content'
          : '当前内容超出视口，可滚动查看完整内容'
        : '';
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
      owned.viewport.subscribe(refresh),
      context.session.subscribe(refresh),
    );
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && owned.state.getState().showSearch) {
        event.preventDefault();
        void owned.state.execute({ type: 'search', open: false });
      }
    });
    await owned.state.execute({ type: 'zoom', value: options.zoom ?? 100 });
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
      setActive(active) {
        owned.setActive(active);
        scope.hidden = !active;
        view?.setActive(active);
      },
      async dispose() {
        if (closed) return;
        closed = true;
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
