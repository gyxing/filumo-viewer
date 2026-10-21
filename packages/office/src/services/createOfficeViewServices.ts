import type { ViewContext } from '@filumo/dom';
import type { OfficeFileViewerWarning } from '../engine/previewWarnings';
import { LayoutScheduler } from '../layout/LayoutScheduler';
import type { OfficeRuntimeData } from '../runtime/types';
import type { OfficeViewServices } from '../view/contracts';
import { ObservableState } from './ObservableState';
import { createOfficeAnnotationService } from './OfficeAnnotationService';
import { OfficeFontService } from './OfficeFontService';
import { OfficeLinkService } from './OfficeLinkService';
import { OfficeNavigationService } from './OfficeNavigationService';
import { OfficeResourceService } from './OfficeResourceService';
import { createOfficeSearchService } from './OfficeSearchService';
import { OfficeViewportService } from './OfficeViewportService';
import { collectViewWarnings, mergeOfficeWarnings } from './OfficeWarnings';
import { DisposalScope } from './lifetime/DisposalScope';
/** 为一个视图创建唯一服务集合；React 和原生视图都只消费这里的所有权。 */
export function createOfficeViewServices(
  context: ViewContext,
): OfficeViewServices {
  const data = context.session.data as OfficeRuntimeData;
  const port = data.interactions;
  const document = context.container.ownerDocument;
  const scope = new DisposalScope();
  let closed = false;
  const warnings = new ObservableState<{
    items: readonly OfficeFileViewerWarning[];
  }>({ items: [] });
  const reported = new Set<string>();
  const report = (incoming: readonly OfficeFileViewerWarning[]) => {
    if (closed) return;
    const items = mergeOfficeWarnings(warnings.getSnapshot().items, incoming);
    warnings.update({ items });
    for (const warning of items) {
      const key = JSON.stringify(warning);
      if (reported.has(key)) continue;
      reported.add(key);
      try {
        data.options?.onWarning?.(warning);
      } catch {
        /* 宿主不拥有服务生命周期。 */
      }
    }
  };
  const resources = new OfficeResourceService(document);
  scope.add(() => resources.dispose());
  const fonts = new OfficeFontService({
    document,
    file: data.file,
    kind: data.preview.previewKind,
    sessionId: context.session.id,
    options: data.options?.fonts,
    onWarning: (warning) => report([warning]),
  });
  scope.add(() => fonts.dispose());
  const links = new OfficeLinkService({
    document,
    file: data.file,
    kind: data.preview.previewKind,
    sourceUrl: context.session.source.url,
    onActivate: data.options?.onHyperlinkActivate,
    onWarning: (warning) => report([warning]),
  });
  scope.add(() => links.dispose());
  const search = createOfficeSearchService();
  scope.add(() => search.dispose());
  const annotations = createOfficeAnnotationService();
  scope.add(() => annotations.dispose());
  const navigation = new OfficeNavigationService(
    context.session.id,
    port,
    search.actions.navigateTarget,
  );
  scope.add(() => navigation.dispose());
  const layout = new LayoutScheduler(
    document.defaultView ?? undefined,
    context.onError,
  );
  scope.add(() => layout.dispose());
  const viewport = new OfficeViewportService(context.container, port, layout);
  scope.add(() => viewport.dispose());
  const activateReview = () => {
    if (port.getState().family !== 'word')
      void port.execute({ type: 'review', open: true }).catch(context.onError);
  };
  const sync = () => {
    const state = port.getState();
    search.configure({ enabled: state.active, visible: state.showSearch });
    // 停用查看器只暂停呈现，不能清空批注选择和窗口缓存。
    annotations.configure({
      enabled: true,
      onActivate: activateReview,
    });
    layout.setActive(state.active);
    fonts.setActive(state.active);
  };
  scope.add(port.subscribe(sync));
  sync();
  scope.add(
    search.subscribe(() => {
      const state = search.getSnapshot();
      port.updateSearch({
        query: state.query,
        resultCount: state.results.length,
        resultIndex: state.currentIndex,
        searching: state.searching,
      });
    }),
  );
  scope.add(
    annotations.subscribe(() => {
      const snapshot = annotations.getSnapshot().snapshot;
      // 批注、笔记与修订能力具有不同展示条件，不能只传批注条数。
      port.updateAnnotations(snapshot.count, snapshot);
    }),
  );
  scope.add(
    port.bind({
      setQuery: search.actions.setQuery,
      nextResult: search.actions.nextResult,
      previousResult: search.actions.previousResult,
      navigatePage: navigation.navigatePage,
    }),
  );
  const updateWarnings = () =>
    report(collectViewWarnings(data.preview, data.file.name, []));
  scope.add(context.session.subscribe(updateWarnings));
  updateWarnings();
  scope.add(() => warnings.dispose());
  return {
    state: port,
    search,
    annotations,
    fonts,
    links,
    resources,
    navigation,
    layout,
    viewport,
    warnings,
    reportWarning: (warning: OfficeFileViewerWarning) => report([warning]),
    setActive: (active: boolean) => port.setActive(active),
    dispose: () => {
      closed = true;
      return scope.dispose();
    },
  };
}
// 服务实现保留在本模块，渲染器只通过 view/contracts.ts 消费稳定接口。
