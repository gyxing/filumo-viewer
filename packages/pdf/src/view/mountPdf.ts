import type { ViewContext, ViewHandle } from '@filumo/dom';
import { createReadingFrame } from '@filumo/dom';
import { STYLE_SCOPE } from '../generated/package';
import type { PdfSession } from '../runtime/PdfSession';
import type { PdfBackend } from '../runtime/contracts';
import { highlightPdfRange } from './PdfLayers';
import { createPdfPassword } from './PdfPassword';
import { PdfSearch } from './PdfSearch';
import { PdfSidebar } from './PdfSidebar';
import { PdfViewport } from './PdfViewport';
import './frame.less';
import './sidebar.less';

/** PDF 外壳只连接会话与通用能力；页面绘制、侧栏和查找各自管理生命周期。 */
export async function mountPdf(context: ViewContext): Promise<ViewHandle> {
  const data = context.session.data as PdfSession,
    frame = createReadingFrame(context, STYLE_SCOPE!, 'pdf'),
    document = context.container.ownerDocument;
  let options = context.options,
    viewport: PdfViewport | undefined,
    sidebar: PdfSidebar | undefined,
    search: PdfSearch | undefined;
  let backend: PdfBackend | undefined,
    stopSearch: (() => void) | undefined,
    closed = false,
    active = true,
    generation = 0,
    highlightGeneration = 0,
    lastNavigation = -1,
    lastError: Error | undefined,
    noticeId = 0;
  const highlight = async () => {
    const current = ++highlightGeneration,
      hit = search?.getCurrent(),
      target = viewport;
    if (!hit || !target || !search || !backend || search.signal.aborted) {
      frame.body
        .querySelectorAll('.filumo-pdf-highlight')
        .forEach((node) => node.remove());
      lastNavigation = -1;
      return;
    }
    const navigationRevision = search.getSnapshot().navigationRevision;
    if (navigationRevision !== lastNavigation) {
      frame.body
        .querySelectorAll('.filumo-pdf-highlight')
        .forEach((node) => node.remove());
      lastNavigation = navigationRevision;
      await target.goTo(hit.pageIndex, search.signal);
    }
    if (closed || current !== highlightGeneration || target !== viewport)
      return;
    const page = target.getPageElement(hit.pageIndex);
    if (!page) return;
    const [text, metrics] = await Promise.all([
      search.text(hit.pageIndex, search.signal),
      backend.getMetrics(hit.pageIndex, search.signal),
    ]);
    if (closed || current !== highlightGeneration || target !== viewport)
      return;
    highlightPdfRange(
      page,
      text,
      hit.start,
      hit.end,
      metrics,
      target.getSnapshot().rotation,
    );
  };
  const publish = () => {
    if (closed) return;
    const en = options.locale === 'en-US',
      state = viewport?.getSnapshot(),
      side = sidebar?.getState(),
      find = search?.getSnapshot();
    if (state) sidebar?.updateCurrent(state.index);
    if (viewport) sidebar?.updateReadingPosition(viewport.getReadingPosition());
    context.setCapabilities({
      actions: [
        {
          id: 'pdf.outline',
          kind: 'toggle',
          label: en ? 'Outline' : '大纲',
          pressed: side?.open && side.mode === 'outline',
          enabled: !!sidebar,
          toolbar: {
            placement: 'main',
            order: 10,
            priority: 120,
          },
          run: () => sidebar?.show('outline'),
        },
        {
          id: 'pdf.search',
          kind: 'action',
          label: en ? 'Find' : '查找',
          // 核心导航之后优先保留查找，不改变旋转的主栏常驻规则。
          toolbar: { placement: 'main', order: 20, priority: 110 },
          enabled: !!search,
          run: () => sidebar?.select('search', true),
        },
        {
          id: 'pdf.thumbnails',
          kind: 'toggle',
          label: en ? 'Thumbnails' : '缩略图',
          toolbar: { visible: false, placement: 'more', order: 30 },
          pressed: side?.open && side.mode === 'thumbnails',
          enabled: !!sidebar,
          run: () => sidebar?.show('thumbnails'),
        },
        {
          id: 'pdf.rotate',
          kind: 'action',
          label: en ? 'Rotate' : '旋转',
          // 旋转是直接视图操作，窄窗口仍留在主栏，沿用外壳换行规则。
          toolbar: { placement: 'main', order: 50, priority: Infinity },
          enabled: !!viewport,
          run: () => viewport?.rotate(),
        },
      ],
      navigation: state
        ? {
            index: state.index,
            count: state.count,
            toolbar: { order: 30, priority: 120 },
            goTo: async (index) => {
              await viewport?.goTo(index);
            },
          }
        : undefined,
      zoom: state
        ? {
            value: state.zoom,
            min: 1,
            max: 500,
            step: 10,
            toolbar: { order: 40 },
            mode: {
              value: state.mode,
              options: [
                { value: 'fit-width', label: en ? 'Fit width' : '适应宽度' },
              ],
              async set() {
                viewport?.fitWidth();
              },
            },
            async set(value) {
              viewport?.setZoom(value);
            },
          }
        : undefined,
      search:
        search && find
          ? {
              query: find.query,
              resultCount: find.resultCount,
              currentIndex: find.currentIndex,
              searching: find.searching,
              setQuery: async (value) => {
                sidebar?.select('search', true);
                await search?.setQuery(value);
              },
              next: () => search!.next(),
              previous: () => search!.previous(),
            }
          : undefined,
    });
    if (active) void highlight().catch(() => undefined);
  };
  const render = async () => {
    const current = ++generation,
      state = data.getSnapshot();
    frame.update(options);
    if (state.phase === 'password') {
      frame.state('');
      frame.body.replaceChildren(
        createPdfPassword(
          document,
          state.passwordIncorrect,
          options.locale,
          (value) => data.submitPassword(value),
        ),
      );
      publish();
      void Promise.resolve().then(() => {
        if (!closed && active)
          frame.body.querySelector<HTMLInputElement>('input')?.focus();
      });
      return;
    }
    if (state.phase === 'error') {
      if (viewport) {
        if (state.error !== lastError) {
          lastError = state.error;
          frame.notice(++noticeId, state.error?.message, options.locale);
        }
        publish();
      } else
        frame.state(
          state.error?.message ??
            (options.locale === 'en-US'
              ? 'PDF cannot be opened'
              : 'PDF 无法打开'),
          undefined,
          true,
        );
      return;
    }
    if (state.phase !== 'ready') {
      frame.state(
        options.locale === 'en-US' ? 'Reading PDF…' : '正在读取 PDF…',
      );
      publish();
      return;
    }
    if (viewport) {
      publish();
      return;
    }
    const next = data.getBackend();
    if (!next) return;
    const first = await next.getMetrics(0, context.session.signal);
    if (closed || !active || current !== generation) return;
    backend = next;
    frame.state('');
    frame.body.replaceChildren();
    const workspace = document.createElement('div'),
      host = document.createElement('div');
    workspace.className = 'filumo-pdf-workspace';
    host.className = 'filumo-pdf-document';
    workspace.append(host);
    frame.body.append(workspace);
    viewport = new PdfViewport(
      host,
      next,
      data,
      { ...context, options },
      publish,
      first,
      (position) => sidebar?.updateReadingPosition(position),
    );
    search = new PdfSearch(next, data.options);
    sidebar = new PdfSidebar(
      document,
      next,
      viewport,
      search,
      (index, ratio, signal) => viewport?.goTo(index, signal, ratio),
      publish,
      options.locale,
      context.stylePolicy,
      context.onError,
    );
    workspace.prepend(sidebar.element);
    stopSearch = search.subscribe(publish);
    publish();
  };
  const run = () => {
    if (!closed && active)
      void render().catch((error) => {
        if (!closed) context.onError(error);
      });
  };
  const stop = data.subscribe(run);
  try {
    await render();
  } catch (error) {
    stop();
    stopSearch?.();
    sidebar?.dispose();
    search?.dispose();
    await viewport?.dispose();
    frame.dispose();
    throw error;
  }
  return {
    update(next) {
      options = next;
      frame.update(options);
      viewport?.update(next);
      sidebar?.update(next.locale);
      if (data.getSnapshot().phase === 'password') run();
      else publish();
    },
    setActive(value) {
      active = value;
      frame.setActive(value);
      viewport?.setActive(value);
      sidebar?.setActive(value);
      if (!value) {
        generation++;
        highlightGeneration++;
      } else run();
    },
    async dispose() {
      if (closed) return;
      closed = true;
      generation++;
      highlightGeneration++;
      stop();
      stopSearch?.();
      sidebar?.dispose();
      search?.dispose();
      await viewport?.dispose();
      frame.dispose();
    },
  };
}
