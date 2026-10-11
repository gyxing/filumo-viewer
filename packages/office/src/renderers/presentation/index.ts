import type { ViewContext, ViewHandle } from '@fivo/dom';
import { PresentationAnnotationSource } from '../../engine/presentation/PresentationAnnotationSource';
import { getPresentationSource } from '../../engine/presentation/presentationSourceRegistry';
import { normalizePresentationTransitionDuration } from '../../engine/presentation/transitionTypes';
import type { OfficeRuntimeData } from '../../runtime/types';
import { mountWatermark } from '../../view/shared/mountWatermark';
import {
  mountNativeOffice,
  type NativeOfficeContext,
} from '../common/mountNativeOffice';
import { NotesView } from './NotesView';
import { PresentationSourceBinding } from './PresentationSourceBinding';
import { SlideRequestController } from './SlideRequestController';
import { SlideScene } from './SlideScene';
import { ThumbnailPane } from './ThumbnailPane';
import './presentation.less';
import './styles/document.less';
/** PPT/PPTX 共享原 Source，原生视图不重复解析文件。 */
export function mountPresentation(context: ViewContext): Promise<ViewHandle> {
  return mountNativeOffice(context, mountPresentationView);
}
async function mountPresentationView(
  context: NativeOfficeContext,
): Promise<ViewHandle> {
  const data = context.session.data as OfficeRuntimeData,
    preview = data.preview;
  if (preview.previewKind !== 'ppt' && preview.previewKind !== 'pptx')
    throw new Error('演示文稿视图类型不匹配');
  const resolveSource = () => {
    const preview = data.preview;
    if (preview.previewKind !== 'ppt' && preview.previewKind !== 'pptx')
      throw new Error('演示文稿类型发生改变');
    const source =
      preview.mode === 'source'
        ? preview.source
        : getPresentationSource(preview.model.document);
    if (!source) throw new Error('演示文稿 Source 不可用');
    return source;
  };
  const source = new PresentationSourceBinding(context.session, resolveSource);
  let sourceIdentity = source.identity;
  let stopSearch: (() => void) | undefined;
  const doc = context.document,
    services = context.services,
    port = services.state,
    root = doc.createElement('div'),
    workspace = doc.createElement('div'),
    surface = doc.createElement('div'),
    viewport = doc.createElement('section'),
    wrap = doc.createElement('div'),
    transition = doc.createElement('div');
  root.className = 'office-file-pptx-viewer';
  root.dataset.officeRenderer = 'presentation-dom';
  workspace.className = 'office-file-pptx-viewer__workspace';
  surface.className = 'office-file-watermark-surface';
  viewport.className = 'office-file-pptx-viewer__viewport';
  viewport.dataset.officeFitViewport = 'true';
  viewport.dataset.officeOverflowViewport = 'true';
  wrap.className = 'office-file-pptx-viewer__slide-wrap';
  transition.className = 'office-file-presentation-transition';
  transition.dataset.officeFitTarget = 'true';
  wrap.append(transition);
  viewport.append(wrap);
  surface.append(viewport);
  workspace.append(surface);
  root.append(workspace);
  context.stage.append(root);
  const requests = new SlideRequestController(source);
  let closed = false,
    selected = -1,
    zoom = -1,
    notesKey = '',
    promise: Promise<unknown> = Promise.resolve(),
    scene: SlideScene | undefined,
    outgoing: SlideScene | undefined,
    shown: ReturnType<typeof requests.getSnapshot>['slide'],
    consumed = 0,
    timer: ReturnType<typeof setTimeout> | undefined;
  const select = (index: number) => {
    void port
      .execute({ type: 'navigate', target: { kind: 'slide', index } })
      .catch(context.onError);
  };
  const thumbs = new ThumbnailPane(source, context, select);
  root.prepend(thumbs.element);
  const notes = new NotesView(context);
  workspace.append(notes.element);
  const watermark = mountWatermark(
    surface,
    context.options.watermark
      ? { content: context.options.watermark }
      : undefined,
  );
  const clearTransition = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    outgoing?.dispose();
    outgoing = undefined;
    transition
      .querySelector('.office-file-presentation-transition__slide--outgoing')
      ?.remove();
    transition.className = 'office-file-presentation-transition';
    transition.dataset.transitionActive = 'false';
  };
  const syncNotes = () => {
    const state = port.getState(),
      key = selected + ':' + state.showNotes;
    if (key !== notesKey) {
      notesKey = key;
      void requests.showNotes(state.showNotes);
    }
    notes.update(requests.getSnapshot().notes, state.showNotes);
  };
  const render = () => {
    if (closed) return;
    const state = port.getState(),
      current = requests.getSnapshot(),
      snapshot = source.getSnapshot();
    transition.dataset.officeFitBaseWidth = String(
      current.slide?.width ?? snapshot.width,
    );
    transition.dataset.officeFitBaseHeight = String(
      current.slide?.height ?? snapshot.height,
    );
    transition.style.width =
      ((current.slide?.width ?? snapshot.width) * state.zoom) / 100 + 'px';
    transition.style.height =
      ((current.slide?.height ?? snapshot.height) * state.zoom) / 100 + 'px';
    if (current.error) {
      clearTransition();
      scene?.dispose();
      scene = undefined;
      shown = undefined;
      transition.replaceChildren();
      const message = doc.createElement('div'),
        retry = doc.createElement('button');
      message.setAttribute('role', 'alert');
      message.textContent = current.error.message;
      retry.type = 'button';
      retry.textContent = context.locale === 'en-US' ? 'Retry' : '重试';
      retry.onclick = () => {
        selected = -1;
        source.retry(state.activeIndex);
        // 回调注册后才调用，此时所引用的节点/句柄已初始化。
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        sync();
      };
      transition.append(message, retry);
    } else if (current.slide) {
      const next = current.slide;
      const options = {
        zoom: state.zoom,
        interactive: true,
        slideIndex: state.activeIndex,
        renderKey: 'slide-' + next.id,
        media: data.options?.media,
        sourceUrl: context.session.source.url,
      };
      if (next !== shown) {
        const previous = shown;
        clearTransition();
        scene?.dispose();
        transition.replaceChildren();
        const intent = state.transitionIntent;
        const animate =
          !!previous &&
          previous.id !== next.id &&
          state.transitions &&
          !!next.transition &&
          !!intent &&
          intent.targetIndex === state.activeIndex &&
          intent.token > consumed &&
          !doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)')
            .matches;
        if (intent?.targetIndex === state.activeIndex)
          consumed = Math.max(consumed, intent.token);
        if (animate) {
          const settings = next.transition!;
          outgoing = new SlideScene(previous!, context, {
            zoom: state.zoom,
            interactive: false,
            renderKey: 'out-' + previous!.id,
            media: false,
          });
          const holder = doc.createElement('div');
          holder.className =
            'office-file-presentation-transition__slide office-file-presentation-transition__slide--outgoing';
          holder.append(outgoing.element);
          transition.append(holder);
          transition.className +=
            ' office-file-presentation-transition--' +
            settings.type +
            ' office-file-presentation-transition--' +
            (settings.direction ??
              (intent!.direction === 'next' ? 'left' : 'right'));
          transition.style.setProperty(
            '--office-file-presentation-transition-duration',
            normalizePresentationTransitionDuration(settings.durationMs) + 'ms',
          );
          transition.dataset.transitionActive = 'true';
          timer = setTimeout(
            clearTransition,
            normalizePresentationTransitionDuration(settings.durationMs) + 80,
          );
        }
        scene = new SlideScene(next, context, options);
        const incoming = doc.createElement('div');
        incoming.className =
          'office-file-presentation-transition__slide office-file-presentation-transition__slide--incoming';
        incoming.onanimationend = (event) => {
          if (event.target === incoming) clearTransition();
        };
        incoming.append(scene.element);
        transition.append(incoming);
        shown = next;
      } else scene?.update(next, options);
    } else if (!scene) {
      transition.textContent = current.loading
        ? context.locale === 'en-US'
          ? 'Loading slide'
          : '正在读取幻灯片'
        : context.locale === 'en-US'
        ? 'No slides'
        : '没有可显示的幻灯片';
    }
    notes.update(current.notes, state.showNotes);
  };
  const sync = () => {
    if (closed) return;
    const state = port.getState();
    if (!state.active) return;
    thumbs.setSelection(state.activeIndex);
    if (zoom !== state.zoom) {
      zoom = state.zoom;
      viewport.scrollTop = 0;
      viewport.scrollLeft = 0;
    }
    if (
      selected !== state.activeIndex ||
      (!requests.getSnapshot().slide &&
        !requests.getSnapshot().loading &&
        !requests.getSnapshot().error &&
        source.getSnapshot().slideCount > 0)
    ) {
      selected = state.activeIndex;
      viewport.scrollTop = 0;
      viewport.scrollLeft = 0;
      promise = requests
        .select(selected, context.signal)
        .then(() => {
          notesKey = '';
          syncNotes();
        })
        .catch((error) => {
          if (!(error instanceof Error && error.name === 'AbortError'))
            render();
        });
    }
    syncNotes();
    render();
  };
  const stops = [
    requests.subscribe(render),
    port.subscribe(sync),
    source.subscribe(() => {
      if (source.identity !== sourceIdentity) {
        sourceIdentity = source.identity;
        selected = -1;
        requests.invalidate();
        thumbs.reset();
        stopSearch?.();
        stopSearch = source.searchProvider
          ? services.search.actions.registerProvider(source.searchProvider)
          : undefined;
      }
      port.updateDocument({ slideCount: source.getSnapshot().slideCount });
      thumbs.refresh();
      sync();
    }),
    services.search.subscribe(() => scene?.refreshText()),
    services.annotations.subscribe(() => scene?.refreshAnnotations()),
  ];
  const annotationSource = new PresentationAnnotationSource(source);
  stops.push(services.annotations.actions.registerSource(annotationSource));
  if (source.searchProvider)
    stopSearch = services.search.actions.registerProvider(
      source.searchProvider,
    );
  stops.push(() => stopSearch?.());
  const navigate = async (
    index: number,
    id?: string,
    annotationId?: string,
  ) => {
    if (index < 0 || index >= source.getSnapshot().slideCount) return false;
    await port.execute({ type: 'navigate', target: { kind: 'slide', index } });
    await promise;
    if (closed || port.getState().activeIndex !== index) return false;
    const elements = Array.from(
      viewport.querySelectorAll<HTMLElement>(
        '[data-office-presentation-element-id],[data-office-annotation-id]',
      ),
    );
    const target =
      (annotationId
        ? elements.find(
            (node) => node.dataset.officeAnnotationId === annotationId,
          )
        : undefined) ??
      (id
        ? elements.find(
            (node) => node.dataset.officePresentationElementId === id,
          )
        : undefined);
    if (target) {
      const rect = target.getBoundingClientRect(),
        bounds = viewport.getBoundingClientRect();
      viewport.scrollTo({
        top: Math.max(
          0,
          viewport.scrollTop +
            rect.top -
            bounds.top -
            (viewport.clientHeight - rect.height) / 2,
        ),
        left: Math.max(
          0,
          viewport.scrollLeft +
            rect.left -
            bounds.left -
            (viewport.clientWidth - rect.width) / 2,
        ),
      });
      if (annotationId) target.focus({ preventScroll: true });
    }
    return id || annotationId ? !!target : true;
  };
  stops.push(
    services.search.actions.registerNavigator('presentation', (target) =>
      target.kind === 'presentation'
        ? navigate(target.slideIndex, target.elementId)
        : false,
    ),
  );
  stops.push(
    services.annotations.actions.registerNavigator(
      'presentation-element',
      (annotation) => {
        const target = annotation.target;
        if (target.kind !== 'presentation-element') return false;
        const index =
          target.slideIndex ??
          source
            .getSnapshot()
            .slides.findIndex((slide) => slide.id === target.slideId);
        return navigate(index, target.elementId, annotation.id);
      },
    ),
  );
  stops.push(
    services.links.registerNavigator('presentation', (target) => {
      if (target.family !== 'presentation') return false;
      const snapshot = source.getSnapshot();
      let index = target.slideId
        ? snapshot.slides.findIndex((slide) => slide.id === target.slideId)
        : target.slideIndex;
      if (target.action === 'first') index = 0;
      if (target.action === 'last') index = snapshot.slideCount - 1;
      if (target.action === 'next')
        index = Math.min(
          snapshot.slideCount - 1,
          port.getState().activeIndex + 1,
        );
      if (target.action === 'previous')
        index = Math.max(0, port.getState().activeIndex - 1);
      return index === undefined ? false : navigate(index);
    }),
  );
  port.updateDocument({ slideCount: source.getSnapshot().slideCount });
  sync();
  await promise;
  return {
    update(options) {
      context.options = options;
      context.locale = options.locale;
      watermark.update(
        options.watermark ? { content: options.watermark } : undefined,
      );
      thumbs.refresh();
      render();
    },
    setActive(active) {
      thumbs.setActive(active);
      requests.setActive(active);
      scene?.setActive(active);
      if (!active) clearTransition();
      else sync();
    },
    async dispose() {
      if (closed) return;
      closed = true;
      stops.forEach((stop) => stop());
      clearTransition();
      requests.dispose();
      await source.dispose();
      annotationSource.dispose();
      thumbs.dispose();
      notes.dispose();
      watermark.dispose();
      scene?.dispose();
      root.remove();
    },
  };
}
