import type { ViewContext, ViewHandle } from '@fivo/dom';
import { createMemoryOfficeAnnotationSource } from '../../engine/annotations/AnnotationSource';
import type { WordReviewDocument } from '../../engine/word/review/types';
import type { OfficeRuntimeData } from '../../runtime/types';
import '../../styles/annotations.less';
import { mountWatermark } from '../../view/shared/mountWatermark';
import {
  mountNativeOffice,
  type NativeOfficeContext,
} from '../common/mountNativeOffice';
import { DocxMeasurement } from './DocxMeasurement';
import { NativeWordSource } from './NativeWordSource';
import { WordOutline } from './WordOutline';
import { WordPageWindow } from './WordPageWindow';
import './styles/doc.less';
import './styles/docx.less';
import './styles/pages.less';
import './styles/review.less';
import './word.less';
/** DOC/DOCX/WPS 只替换视图，分页、源模型与只读修订投影仍使用原算法。 */
export function mountWord(context: ViewContext): Promise<ViewHandle> {
  return mountNativeOffice(context, mountWordView);
}
async function mountWordView(
  context: NativeOfficeContext,
): Promise<ViewHandle> {
  const data = context.session.data as OfficeRuntimeData,
    doc = context.document,
    services = context.services,
    port = services.state;
  const root = doc.createElement('div'),
    body = doc.createElement('div'),
    surface = doc.createElement('div'),
    scroller = doc.createElement('div'),
    status = doc.createElement('div');
  const kind = data.preview.previewKind;
  if (kind !== 'doc' && kind !== 'docx') throw new Error('Word 类型不匹配');
  root.className =
    kind === 'docx' ? 'office-file-docx-viewer' : 'office-file-doc-viewer';
  root.dataset.officeRenderer = 'word-dom';
  body.className =
    kind === 'docx'
      ? 'office-file-docx-viewer__body'
      : 'office-file-doc-viewer__body';
  surface.className = 'office-file-watermark-surface';
  scroller.className =
    kind === 'docx'
      ? 'office-file-docx-viewer__scroller'
      : 'office-file-doc-viewer__scroller';
  scroller.dataset.officeFitViewport = 'true';
  scroller.dataset.officeOverflowViewport = 'true';
  scroller.dataset.officeOverflowVertical = 'false';
  status.setAttribute('role', 'status');
  surface.append(scroller);
  body.append(surface);
  root.append(body, status);
  context.stage.append(root);
  const watermark = mountWatermark(
    surface,
    context.options.watermark
      ? { content: context.options.watermark }
      : undefined,
  );
  let closed = false,
    generation = 0,
    identity: unknown,
    mode = '',
    binding: NativeWordSource | undefined,
    window: WordPageWindow | undefined,
    measurement: DocxMeasurement | undefined,
    outline: WordOutline | undefined,
    pending: Promise<void> = Promise.resolve(),
    review: WordReviewDocument | undefined;
  let sourceStops: Array<() => void> = [],
    stopSearch: (() => void) | undefined,
    stopAnnotations: (() => void) | undefined;
  const rawIdentity = () => {
    const preview = data.preview;
    return preview.mode === 'source' ? preview.source : preview.model;
  };
  const clearBinding = async () => {
    sourceStops.forEach((stop) => stop());
    sourceStops = [];
    stopSearch?.();
    stopSearch = undefined;
    stopAnnotations?.();
    stopAnnotations = undefined;
    measurement?.dispose();
    measurement = undefined;
    window?.dispose();
    window = undefined;
    outline?.dispose();
    outline = undefined;
    const old = binding;
    binding = undefined;
    port.updateDocument({ outlineCount: 0 });
    review = undefined;
    await old?.dispose();
  };
  const updateReview = () => {
    if (!binding) return;
    const next =
      binding.kind === 'docx' ? binding.docx?.review : binding.doc?.review;
    if (next === review) return;
    review = next;
    stopAnnotations?.();
    stopAnnotations = next
      ? services.annotations.actions.registerSource(
          createMemoryOfficeAnnotationSource({
            annotations: next.annotations,
            revisions: next.revisions,
            revisionCount: next.revisionCount,
            noteCount: next.noteCount,
            supportsRevisionModes: next.supportsRevisionModes,
          }),
        )
      : undefined;
  };
  const locate = async (blockId: string, markerId?: string) => {
    await pending;
    if (closed) return false;
    return window?.locate(blockId, markerId) ?? false;
  };
  const rebind = () => {
    const token = ++generation;
    identity = rawIdentity();
    mode = port.getState().revisionMode;
    pending = (async () => {
      await clearBinding();
      if (closed || token !== generation) return;
      status.textContent =
        context.locale === 'en-US' ? 'Preparing pages' : '正在准备分页';
      const next = await NativeWordSource.create(
        data.preview,
        context.session.id + '-' + token,
        port.getState().revisionMode,
        context.signal,
      );
      if (closed || token !== generation) {
        await next.dispose();
        return;
      }
      binding = next;
      const updateOutline = () => {
        if (!closed && binding === next)
          port.updateDocument({
            outlineCount: next.outline.getSnapshot().count,
          });
      };
      sourceStops.push(next.outline.subscribe(updateOutline));
      updateOutline();
      window = new WordPageWindow(next, scroller, context);
      outline = new WordOutline(
        next.outline,
        context,
        (id) => locate(id),
        scroller,
      );
      body.prepend(outline.element);
      if (next.measurement)
        measurement = new DocxMeasurement(next.measurement, context, root);
      let provider = next.searchProvider;
      if (provider)
        stopSearch = services.search.actions.registerProvider(provider);
      sourceStops.push(
        next.subscribe(() => {
          if (provider !== next.searchProvider) {
            provider = next.searchProvider;
            stopSearch?.();
            stopSearch = provider
              ? services.search.actions.registerProvider(provider)
              : undefined;
          }
          updateReview();
        }),
      );
      updateReview();
      outline.update(port.getState().showOutline);
      window.update(port.getState().zoom);
      status.textContent = '';
    })().catch((error) => {
      if (!closed && token === generation) {
        status.textContent = String(error);
        context.onError(error);
      }
    });
  };
  const sync = () => {
    if (closed) return;
    const state = port.getState();
    if (
      identity !== rawIdentity() ||
      (data.preview.mode === 'materialized' && mode !== state.revisionMode)
    ) {
      rebind();
      return;
    }
    mode = state.revisionMode;
    outline?.update(state.showOutline);
    window?.update(state.zoom);
    updateReview();
  };
  const stops = [
    port.subscribe(sync),
    context.session.subscribe(sync),
    services.search.subscribe(() => window?.refreshText()),
    services.annotations.subscribe(() => window?.refreshAnnotations()),
    services.navigation.bindPageNavigator(async (index) => {
      await pending;
      if (window) await window.goTo(index);
    }),
  ];
  stops.push(
    services.search.actions.registerNavigator('word', (target) =>
      target.kind === 'word' ? locate(target.blockId) : false,
    ),
  );
  stops.push(
    services.annotations.actions.registerNavigator('word-range', (annotation) =>
      annotation.target.kind === 'word-range'
        ? locate(annotation.target.blockId, annotation.id)
        : false,
    ),
  );
  stops.push(
    services.links.registerNavigator('word', (target) => {
      if (target.family !== 'word' || !binding) return false;
      const summary = binding.kind === 'docx' ? binding.docx : binding.doc;
      const bookmark = summary?.bookmarks?.[target.bookmark];
      return bookmark
        ? locate(bookmark.targetBlockId, bookmark.markerId)
        : false;
    }),
  );
  rebind();
  await pending;
  return {
    update(options) {
      context.options = options;
      context.locale = options.locale;
      watermark.update(
        options.watermark ? { content: options.watermark } : undefined,
      );
      sync();
    },
    setActive(active) {
      window?.setActive(active);
      outline?.setActive(active);
      if (active) sync();
    },
    async dispose() {
      if (closed) return;
      closed = true;
      generation++;
      stops.forEach((stop) => stop());
      await clearBinding();
      watermark.dispose();
      root.remove();
    },
  };
}
