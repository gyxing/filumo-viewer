import type {
  MediaElement,
  SlideElement,
  SlideModel,
} from '../../engine/pptx/types';
import type { OfficeFileViewerPresentationMediaOptions } from '../../engine/presentation/mediaTypes';
import { applyDomStyle, createDom } from '../../view/dom/createDom';
import { mountChart } from '../../view/shared/mountChart';
import type { OfficeRenderContext } from '../../view/types';
import { PresentationElementContext } from './PresentationElementContext';
import { createImageView } from './elements/ImageView';
import { createShapeView } from './elements/ShapeView';
import { createTableView } from './elements/TableView';
import { createTextView } from './elements/TextView';
import { createUnsupportedView } from './elements/UnsupportedView';
import { colorWithOpacity } from './support/paint';
interface Frame {
  node: HTMLElement;
  model: SlideElement;
  dispose?: () => void;
  setActive?: (active: boolean) => void;
  update?: (element: SlideElement) => void;
}
export interface SlideSceneOptions {
  zoom: number;
  interactive?: boolean;
  slideIndex?: number;
  renderKey?: string;
  media?: false | OfficeFileViewerPresentationMediaOptions;
  sourceUrl?: string;
}
/** 按原 SlideElement 判别联合逐类构造真实节点，局部更新不重建音视频与图表实例。 */
export class SlideScene {
  readonly element: HTMLDivElement;
  private background: HTMLDivElement;
  private content: HTMLDivElement;
  private annotations: HTMLDivElement;
  private frames = new Map<string, Frame>();
  private markers = new Map<string, HTMLButtonElement | HTMLSpanElement>();
  private context: PresentationElementContext;
  private closed = false;
  private cancel?: () => void;
  private dirty = new Set<string>();
  private full = true;
  private key = 'scene-' + Math.random().toString(36).slice(2);
  private renderers;
  constructor(
    private slide: SlideModel,
    private readonly base: OfficeRenderContext,
    private options: SlideSceneOptions,
  ) {
    const doc = base.document;
    this.element = doc.createElement('div');
    this.element.className = 'office-file-pptx-slide';
    this.background = doc.createElement('div');
    this.background.className = 'office-file-pptx-slide__background';
    this.content = doc.createElement('div');
    this.content.className = 'office-file-pptx-slide__elements';
    this.annotations = doc.createElement('div');
    this.annotations.className = 'office-file-pptx-slide__annotations';
    this.element.append(this.background, this.content, this.annotations);
    this.context = new PresentationElementContext(
      base,
      this.invalidate,
      options.sourceUrl,
    );
    this.renderers = {
      text: createTextView(this.context),
      shape: createShapeView(this.context),
      table: createTableView(this.context),
      image: createImageView(this.context),
      unsupported: createUnsupportedView(this.context),
    };
    this.draw();
  }
  private invalidate = (ids?: readonly string[]) => {
    if (this.closed) return;
    if (!ids) this.full = true;
    else ids.forEach((id) => this.dirty.add(id));
    this.cancel = this.base.services.layout.schedule(
      this.key,
      () => undefined,
      () => this.draw(),
    );
  };
  update(slide: SlideModel, options: SlideSceneOptions) {
    const changed = this.slide !== slide;
    this.slide = slide;
    const interactiveChanged = this.options.interactive !== options.interactive;
    this.options = options;
    if (changed || interactiveChanged) this.full = true;
    this.draw();
  }
  refreshText() {
    this.invalidate(['@text', '@annotations']);
  }
  refreshAnnotations() {
    this.invalidate(['@annotations']);
  }
  private draw() {
    if (this.closed) return;
    const { slide } = this;
    const interactive = this.options.interactive !== false;
    applyDomStyle(this.element, {
      width: slide.width,
      height: slide.height,
      minWidth: slide.width,
      minHeight: slide.height,
      transform: 'scale(' + this.options.zoom / 100 + ')',
    });
    this.element.dataset.officePresentationSlideId = slide.id;
    if (this.full || this.dirty.has('@background')) {
      this.context.owner = '@background';
      const source = slide.background?.imageRef;
      const resource = this.context.resource(
        typeof source === 'string' ? { kind: 'url', url: source } : source,
      );
      this.background.style.backgroundColor =
        colorWithOpacity(
          slide.background?.fill ?? '#fff',
          slide.background?.fillOpacity,
        ) ?? '';
      this.background.style.backgroundImage = resource.url
        ? 'url(' + JSON.stringify(resource.url) + ')'
        : '';
    }
    const alive = new Set<string>();
    let cursor = this.content.firstChild;
    for (const item of slide.elements) {
      alive.add(item.id);
      let frame = this.frames.get(item.id);
      const redraw =
        this.full ||
        frame?.model !== item ||
        this.dirty.has(item.id) ||
        ((item.type === 'text' || item.type === 'table') &&
          this.dirty.has('@text'));
      if (!frame || redraw) {
        this.context.owner = item.id;
        if (frame?.update && frame.model.type === item.type) {
          frame.update(item);
          frame.model = item;
        } else {
          const next = this.render(item, interactive);
          if (frame) {
            const focused = this.base.document.activeElement;
            const focusables = Array.from(
              frame.node.querySelectorAll<HTMLElement>('[tabindex],button,a'),
            );
            const focusIndex = focusables.indexOf(focused as HTMLElement);
            const replacedCursor = cursor === frame.node;
            frame.dispose?.();
            frame.node.replaceWith(next.node);
            if (replacedCursor) cursor = next.node;
            if (focusIndex >= 0)
              next.node
                .querySelectorAll<HTMLElement>('[tabindex],button,a')
                [focusIndex]?.focus({ preventScroll: true });
          }
          frame = next;
          this.frames.set(item.id, frame);
        }
      }
      if (frame!.node !== cursor)
        this.content.insertBefore(frame!.node, cursor);
      cursor = frame!.node.nextSibling;
    }
    for (const [id, frame] of this.frames)
      if (!alive.has(id)) {
        frame.dispose?.();
        frame.node.remove();
        this.frames.delete(id);
      }
    this.drawAnnotations(interactive);
    this.context.measureText();
    this.full = false;
    this.dirty.clear();
  }
  private render(element: SlideElement, interactive: boolean): Frame {
    const props = {
      element,
      interactive,
      renderKey: this.options.renderKey ?? 'slide-' + this.slide.id,
      searchSlideIndex: interactive ? this.options.slideIndex : undefined,
    };
    let node: Node;
    switch (element.type) {
      case 'text':
        node = this.renderers.text({ ...props, element });
        break;
      case 'shape':
        node = this.renderers.shape({ ...props, element });
        break;
      case 'table':
        node = this.renderers.table({ ...props, element });
        break;
      case 'image':
        node = this.renderers.image({ ...props, element });
        break;
      case 'unsupported':
        node = this.renderers.unsupported({ element });
        break;
      case 'chart': {
        const frame = createDom(this.base.document, 'div', {
          ...this.context.linkProps({
            hyperlink: element.hyperlink,
            source: { type: 'shape', id: element.id },
            interactive,
          }),
          className: 'office-file-pptx-chart-frame',
          'data-office-presentation-element-id': element.id,
          style: {
            left: element.x,
            top: element.y,
            width: element.width,
            height: element.height,
            pointerEvents: interactive ? 'auto' : 'none',
          },
        }) as HTMLElement;
        const source = element.snapshotSource ?? element.chart.snapshotSrc;
        const snapshot = this.context.resource(
          typeof source === 'string' ? { kind: 'url', url: source } : source,
        );
        let chart = element.chart,
          lastSnapshot = snapshot.url,
          lastWidth = element.width,
          lastHeight = element.height;
        const view = mountChart(
          frame,
          {
            chart: snapshot.url
              ? { ...chart, snapshotSrc: snapshot.url }
              : chart,
            width: element.width,
            height: element.height,
          },
          this.base,
        );
        return {
          node: frame,
          model: element,
          dispose: () => view.dispose(),
          setActive: (active) => view.setActive(active),
          update: (next) => {
            if (next.type !== 'chart') return;
            const value = next.snapshotSource ?? next.chart.snapshotSrc;
            const resource = this.context.resource(
              typeof value === 'string' ? { kind: 'url', url: value } : value,
            );
            applyDomStyle(frame, {
              left: next.x,
              top: next.y,
              width: next.width,
              height: next.height,
            });
            if (
              next.chart !== chart ||
              resource.url !== lastSnapshot ||
              next.width !== lastWidth ||
              next.height !== lastHeight
            ) {
              chart = next.chart;
              lastSnapshot = resource.url;
              lastWidth = next.width;
              lastHeight = next.height;
              void view.update({
                chart: resource.url
                  ? { ...chart, snapshotSrc: resource.url }
                  : chart,
                width: next.width,
                height: next.height,
              });
            }
          },
        };
      }
      case 'media':
        return this.media(element, interactive);
      case 'group': {
        const group = createDom(this.base.document, 'div', {
          'data-office-presentation-element-id': element.id,
          style: {
            position: 'absolute',
            left: element.x,
            top: element.y,
            width: element.width,
            height: element.height,
            opacity: element.opacity,
            transform: [
              element.rotate ? 'rotate(' + element.rotate + 'deg)' : '',
              element.flipH ? 'scaleX(-1)' : '',
              element.flipV ? 'scaleY(-1)' : '',
            ]
              .filter(Boolean)
              .join(' '),
          },
        }) as HTMLElement;
        const children = element.children.map((child) =>
          this.render(child, interactive),
        );
        children.forEach((child) => group.append(child.node));
        return {
          node: group,
          model: element,
          dispose: () => children.forEach((child) => child.dispose?.()),
        };
      }
      default: {
        const impossible: never = element;
        throw new Error('未知幻灯片元素：' + String(impossible));
      }
    }
    return { node: node as HTMLElement, model: element };
  }
  private media(initial: MediaElement, interactive: boolean): Frame {
    const doc = this.base.document,
      frame = doc.createElement('div'),
      message = doc.createElement('div');
    message.className = 'office-file-pptx-media__message';
    let player: HTMLMediaElement | undefined,
      download: HTMLAnchorElement | undefined;
    let lastUrl = '';
    const en = this.base.locale === 'en-US';
    const update = (item: SlideElement) => {
      if (item.type !== 'media') return;
      const options = this.options.media;
      let allowed = item.media.sourceKind !== 'external';
      if (
        !allowed &&
        options !== false &&
        options?.allowExternal &&
        typeof item.media.source === 'string'
      ) {
        try {
          allowed = ['http:', 'https:'].includes(
            new URL(item.media.source, doc.baseURI).protocol,
          );
        } catch {}
      }
      const source =
        interactive && allowed && options !== false
          ? typeof item.media.source === 'string'
            ? { kind: 'url' as const, url: item.media.source }
            : item.media.source
          : undefined;
      const resource = this.context.resource(source);
      const poster = this.context.resource(
        typeof item.posterSrc === 'string'
          ? { kind: 'url', url: item.posterSrc }
          : item.posterSrc,
      );
      frame.className =
        'office-file-pptx-media office-file-pptx-media--' +
        item.media.kind +
        (interactive ? '' : ' office-file-pptx-media--thumbnail');
      frame.dataset.officePresentationElementId = item.id;
      applyDomStyle(frame, {
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        transform: [
          item.rotate ? 'rotate(' + item.rotate + 'deg)' : '',
          item.flipH ? 'scaleX(-1)' : '',
          item.flipV ? 'scaleY(-1)' : '',
        ]
          .filter(Boolean)
          .join(' '),
        zIndex: item.zIndex,
      });
      frame.style.backgroundImage = poster.url
        ? 'url(' + JSON.stringify(poster.url) + ')'
        : '';
      const blocked =
        interactive &&
        options !== false &&
        item.media.sourceKind === 'external' &&
        !allowed;
      message.textContent = blocked
        ? en
          ? 'External media is blocked'
          : '外部媒体已阻止'
        : resource.loading
        ? en
          ? 'Loading media'
          : '正在加载媒体'
        : resource.error
        ? en
          ? 'Media cannot be played'
          : '媒体暂不支持播放'
        : '';
      if (message.textContent && !message.parentNode) frame.append(message);
      if (!message.textContent) message.remove();
      if (resource.url && !blocked) {
        if (!player || player.tagName.toLowerCase() !== item.media.kind) {
          player?.pause();
          player?.remove();
          player = doc.createElement(
            item.media.kind === 'video' ? 'video' : 'audio',
          );
          player.controls = true;
          player.preload = 'metadata';
          player.onerror = () => {
            message.textContent = en
              ? 'Media cannot be played'
              : '媒体暂不支持播放';
            frame.append(message);
          };
          frame.append(player);
        }
        player.loop = !!item.media.loop;
        player.setAttribute(
          'aria-label',
          item.alt ?? item.media.fileName ?? item.media.kind,
        );
        if (player.tagName === 'VIDEO')
          (player as HTMLVideoElement).poster = poster.url ?? '';
        if (lastUrl !== resource.url) {
          lastUrl = resource.url;
          player.src = resource.url;
        }
      } else if (player) {
        player.pause();
        player.remove();
        player = undefined;
        lastUrl = '';
      }
      if (
        interactive &&
        options !== false &&
        options?.download !== false &&
        resource.url
      ) {
        if (!download) {
          download = doc.createElement('a');
          download.className = 'office-file-pptx-media__download';
          download.textContent = en ? 'Download media' : '下载媒体';
          download.onclick = (event) => event.stopPropagation();
          frame.append(download);
        }
        download.href = resource.url;
        download.download = item.media.fileName ?? 'media';
        download.rel = 'noopener noreferrer';
        download.target = item.media.sourceKind === 'external' ? '_blank' : '';
      } else {
        download?.remove();
        download = undefined;
      }
      if (
        !interactive &&
        !frame.querySelector('.office-file-pptx-media__poster-icon')
      ) {
        const icon = doc.createElement('span');
        icon.className = 'office-file-pptx-media__poster-icon';
        frame.append(icon);
      }
    };
    update(initial);
    return {
      node: frame,
      model: initial,
      update,
      dispose: () => {
        player?.pause();
        if (player) {
          player.removeAttribute('src');
          player.load();
        }
      },
    };
  }
  private drawAnnotations(interactive: boolean) {
    const alive = new Set<string>();
    const active =
      this.base.services.annotations.getSnapshot().activeAnnotation?.id;
    let cursor = this.annotations.firstChild;
    (this.slide.annotations ?? []).forEach((annotation, index) => {
      alive.add(annotation.id);
      let marker = this.markers.get(annotation.id);
      if (!marker) {
        marker = this.base.document.createElement(
          interactive ? 'button' : 'span',
        );
        this.markers.set(annotation.id, marker);
      }
      marker.className =
        'office-file-pptx-annotation-marker' +
        (active === annotation.id
          ? ' office-file-pptx-annotation-marker--active'
          : '') +
        (interactive ? '' : ' office-file-pptx-annotation-marker--thumbnail');
      applyDomStyle(marker, {
        left: annotation.x ?? undefined,
        top: annotation.y ?? 12 + index * 24,
        right: annotation.x === undefined ? 12 : undefined,
      });
      marker.dataset.officeAnnotationId = annotation.id;
      marker.dataset.active = String(active === annotation.id);
      marker.setAttribute(
        'aria-label',
        annotation.author
          ? annotation.author + '：' + annotation.text
          : annotation.text,
      );
      marker.textContent = interactive ? String(index + 1) : '';
      marker.onclick = (event) => {
        event.stopPropagation();
        void this.base.services.annotations.actions.selectId(annotation.id);
      };
      if (marker !== cursor) this.annotations.insertBefore(marker, cursor);
      cursor = marker.nextSibling;
    });
    for (const [id, marker] of this.markers)
      if (!alive.has(id)) {
        marker.remove();
        this.markers.delete(id);
      }
  }
  setActive(active: boolean) {
    this.element.hidden = !active;
    for (const frame of this.frames.values()) frame.setActive?.(active);
    if (!active)
      this.element
        .querySelectorAll('video,audio')
        .forEach((node) => (node as HTMLMediaElement).pause());
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.cancel?.();
    this.context.dispose();
    for (const frame of this.frames.values()) frame.dispose?.();
    this.frames.clear();
    this.element.remove();
  }
}
