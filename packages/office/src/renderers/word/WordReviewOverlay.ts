import type { OfficeAnnotation } from '../../engine/annotations/types';
import type { OfficeRenderContext } from '../../view/types';
import type { WordPageView } from './WordPageView';
import {
  collectVisibleAnnotationIds,
  collectVisibleCommentAnchors,
  collectVisibleRevisionAnchors,
  intersectsBoundary,
} from './support/wordMarkupAnchors';
import {
  getWordMarkupRailExtent,
  layoutWordMarkupCallouts,
  type WordMarkupCalloutLayout,
} from './support/wordMarkupCalloutLayout';
/** 复用原锚点与多列排布算法，标记挂在所属滚动容器，不依赖 React portal。 */
export class WordReviewOverlay {
  private portal: HTMLDivElement;
  private extent: HTMLSpanElement;
  private annotations = new Map<string, OfficeAnnotation>();
  private ids = '';
  private generation = 0;
  private closed = false;
  private hovered?: string;
  private items = new Map<string, { signature: string; nodes: Node[] }>();
  private resize?: ResizeObserver;
  private mutation?: MutationObserver;
  private stop: () => void;
  private cancel?: () => void;
  private key = 'review-' + Math.random().toString(36).slice(2);
  constructor(
    private readonly page: WordPageView,
    private readonly scroller: HTMLElement,
    private readonly base: OfficeRenderContext,
  ) {
    const doc = base.document;
    this.portal = doc.createElement('div');
    this.portal.className = 'office-file-word-markup-portal';
    this.extent = doc.createElement('span');
    this.extent.className = 'office-file-word-markup-portal__extent';
    this.portal.append(this.extent);
    scroller.append(this.portal);
    scroller.addEventListener('scroll', this.schedule, { passive: true });
    page.element.addEventListener('pointerover', this.hover);
    page.element.addEventListener('pointerout', this.hover);
    const Resize = doc.defaultView?.ResizeObserver,
      Mutation = doc.defaultView?.MutationObserver;
    if (Resize) {
      this.resize = new Resize(this.schedule);
      this.resize.observe(page.element);
      this.resize.observe(scroller);
    }
    if (Mutation) {
      this.mutation = new Mutation(this.schedule);
      this.mutation.observe(page.element, { childList: true, subtree: true });
    }
    this.stop = base.services.annotations.subscribe(this.schedule);
    this.schedule();
  }
  private hover = (event: Event) => {
    const element = (event.target as Element)?.closest?.(
      '[data-office-annotation-id],[data-office-word-revision]',
    ) as HTMLElement | undefined;
    this.hovered =
      event.type === 'pointerout'
        ? undefined
        : element?.dataset.officeAnnotationId
        ? 'comment:' + element.dataset.officeAnnotationId
        : element?.dataset.officeWordRevision
        ? 'revision:' + element.dataset.officeWordRevision
        : undefined;
    this.emphasize();
  };
  private schedule = () => {
    if (this.closed) return;
    this.cancel = this.base.services.layout.schedule(
      this.key,
      () => this.measure(),
      (result) => this.render(result),
    );
  };
  private measure() {
    const article = this.page.element.querySelector('article');
    if (
      !article ||
      this.base.services.state.getState().revisionMode !== 'markup'
    )
      return {
        callouts: [] as readonly WordMarkupCalloutLayout[],
        extent: 0,
        ids: [] as string[],
      };
    const box = article.getBoundingClientRect(),
      scroll = this.scroller.getBoundingClientRect(),
      window = this.base.document.defaultView!;
    const left = scroll.left + this.scroller.clientLeft,
      top = scroll.top + this.scroller.clientTop;
    const boundary = {
      left: Math.max(0, left),
      top: Math.max(0, top),
      right: Math.min(window.innerWidth, left + this.scroller.clientWidth),
      bottom: Math.min(window.innerHeight, top + this.scroller.clientHeight),
    };
    if (!intersectsBoundary(box, boundary))
      return {
        callouts: [] as readonly WordMarkupCalloutLayout[],
        extent: 0,
        ids: [] as string[],
      };
    const originLeft = left - this.scroller.scrollLeft,
      originTop = top - this.scroller.scrollTop;
    const ids = collectVisibleAnnotationIds(article, boundary);
    const anchors = [
      ...collectVisibleCommentAnchors({
        article,
        boundary,
        contentOriginLeft: originLeft,
        contentOriginTop: originTop,
        annotationById: this.annotations,
      }),
      ...collectVisibleRevisionAnchors({
        article,
        boundary,
        contentOriginLeft: originLeft,
        contentOriginTop: originTop,
        activeRevision:
          this.base.services.annotations.getSnapshot().activeRevision,
      }),
    ];
    const clamp = (value: number, min: number, max: number) =>
      Math.min(Math.max(value, min), Math.max(min, max));
    const limits = {
      top: clamp(
        boundary.top - originTop,
        box.top - originTop,
        box.bottom - originTop,
      ),
      bottom: clamp(
        boundary.bottom - originTop,
        box.top - originTop,
        box.bottom - originTop,
      ),
      pageRight: box.right - originLeft,
    };
    const callouts = layoutWordMarkupCallouts(anchors, limits);
    return {
      callouts,
      ids,
      extent: getWordMarkupRailExtent(limits.pageRight, callouts),
    };
  }
  private render(result: ReturnType<WordReviewOverlay['measure']>) {
    if (this.closed) return;
    const ids = JSON.stringify(result.ids);
    if (ids !== this.ids) {
      this.ids = ids;
      const generation = ++this.generation;
      void this.base.services.annotations.actions
        .loadAnnotationsByIds(result.ids)
        .then((items) => {
          if (this.closed || generation !== this.generation) return;
          this.annotations = new Map(items.map((item) => [item.id, item]));
          this.schedule();
        });
    }
    this.extent.style.left = result.extent + 'px';
    const alive = new Set<string>(),
      messages = this.page.context.messages;
    for (const callout of result.callouts) {
      alive.add(callout.key);
      const signature = JSON.stringify(callout);
      let entry = this.items.get(callout.key);
      if (entry?.signature !== signature) {
        entry?.nodes.forEach((node) => node.parentNode?.removeChild(node));
        const kinds = {
          insert: messages.review.revisionInsert,
          delete: messages.review.revisionDelete,
          'move-from': messages.review.revisionMoveFrom,
          'move-to': messages.review.revisionMoveTo,
          format: messages.review.revisionFormat,
        };
        const fragment = this.page.context.render('WordMarkupCallout', {
          callout,
          revisionKindLabel: callout.revisionKind
            ? kinds[callout.revisionKind]
            : undefined,
          unknownAuthorLabel: messages.review.unknownAuthor,
          emptyContentLabel:
            callout.type === 'comment'
              ? messages.review.emptyComment
              : messages.review.emptyRevision,
          emphasized: false,
          onSelect: () => {
            const service = this.base.services.annotations;
            if (callout.type === 'comment')
              void service.actions.selectId(callout.id);
            else if (service.getSnapshot().activeRevision?.id === callout.id)
              service.actions.clearActiveRevision();
            else void service.actions.activateRevisionId(callout.id);
          },
        });
        const nodes = Array.from(fragment.childNodes);
        this.portal.append(fragment);
        entry = { signature, nodes };
        this.items.set(callout.key, entry);
      }
    }
    for (const [key, item] of this.items)
      if (!alive.has(key)) {
        item.nodes.forEach((node) => node.parentNode?.removeChild(node));
        this.items.delete(key);
      }
    this.emphasize();
  }
  private emphasize() {
    const state = this.base.services.annotations.getSnapshot();
    this.portal
      .querySelectorAll<HTMLElement>(
        '[data-office-word-markup-callout],[data-office-word-markup-connector]',
      )
      .forEach((element) => {
        const key =
          element.dataset.officeWordMarkupCallout ??
          element.dataset.officeWordMarkupConnector;
        const active =
          key === this.hovered ||
          key === 'comment:' + state.activeAnnotation?.id ||
          key === 'revision:' + state.activeRevision?.id;
        element.dataset.emphasized = String(active);
      });
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.generation++;
    this.cancel?.();
    this.stop();
    this.resize?.disconnect();
    this.mutation?.disconnect();
    this.scroller.removeEventListener('scroll', this.schedule);
    this.page.element.removeEventListener('pointerover', this.hover);
    this.page.element.removeEventListener('pointerout', this.hover);
    this.portal.remove();
    this.items.clear();
  }
}
