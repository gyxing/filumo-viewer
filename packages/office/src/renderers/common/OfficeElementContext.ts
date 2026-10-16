import type { TextStyle } from '../../engine/pptx/types';
import type { OfficeResourceSource } from '../../engine/resource-store/types';
import { findSearchMatches } from '../../engine/search/normalizeSearchText';
import type { ResourceLease } from '../../services/OfficeResourceService';
import { classifyOfficeHyperlink } from '../../shared/hyperlink/classifyOfficeHyperlink';
import type {
  OfficeHyperlink,
  OfficeHyperlinkSource,
} from '../../shared/hyperlink/types';
import { downloadOfficeImage } from '../../shared/image-preview/downloadOfficeImage';
import { createDom, type DomChild } from '../../view/dom/createDom';
import { mountImagePreview } from '../../view/shared/mountImagePreview';
import type { OfficeRenderContext } from '../../view/types';
import { createOfficeIcon, type OfficeUiIcon } from '../../view/ui';
interface ContextMenuAction {
  label: string;
  icon: OfficeUiIcon;
  run: () => void | Promise<void>;
}
interface ResourceState {
  url?: string;
  loading: boolean;
  error?: string;
  lease?: ResourceLease;
  owners: Set<string>;
}
interface FitState {
  containerRef: { current: HTMLDivElement | null };
  scale: number;
  tracking: number;
  fit: TextStyle['fit'];
  enabled: boolean;
  owner: string;
}
/** 单页直接 DOM 渲染的状态：资源与测量归页级所有者，不实现组件或 Hook 运行时。 */
export class OfficeElementContext {
  readonly document: Document;
  readonly services: OfficeRenderContext['services'];
  readonly imagePreview = { options: { enabled: true } };
  owner = '';
  private closed = false;
  private abort = new AbortController();
  private resources = new Map<string, ResourceState>();
  private fits = new Map<string, FitState>();
  private menu?: HTMLElement;
  private closePopup?: () => void;
  private unsubscribeFonts: () => void;
  constructor(
    readonly renderContext: OfficeRenderContext,
    private readonly invalidate: (ids?: readonly string[]) => void,
    private readonly sourceUrl?: string,
  ) {
    this.document = renderContext.document;
    this.services = renderContext.services;
    this.unsubscribeFonts = this.services.fonts.subscribe(() =>
      this.invalidate(['@text']),
    );
    renderContext.signal.addEventListener('abort', this.dispose, {
      once: true,
    });
  }
  resource = (
    source?: OfficeResourceSource,
  ): { url?: string; loading: boolean; error?: string } => {
    if (!source) return { url: undefined, loading: false };
    if (source.kind === 'url') return { url: source.url, loading: false };
    const key = source.id;
    let record = this.resources.get(key);
    if (record) {
      record.owners.add(this.owner);
      return record;
    }
    record = { loading: true, owners: new Set([this.owner]) };
    this.resources.set(key, record);
    const current = record;
    void this.services.resources.acquire(source, this.abort.signal).then(
      (lease) => {
        if (this.closed || this.resources.get(key) !== current) {
          lease.release();
          return;
        }
        current.lease = lease;
        current.url = lease.url;
        current.loading = false;
        this.invalidate([...current.owners]);
      },
      (error) => {
        if (this.closed) return;
        current.loading = false;
        current.error = String(error);
        this.invalidate([...current.owners]);
      },
    );
    return record;
  };
  textFit = (fit: TextStyle['fit'], enabled: boolean, id: string) => {
    let value = this.fits.get(id);
    if (!value) {
      value = {
        containerRef: { current: null },
        scale: 1,
        tracking: 0,
        fit,
        enabled,
        owner: this.owner,
      };
      this.fits.set(id, value);
    }
    value.enabled = enabled;
    value.fit = fit;
    return value;
  };
  /** 所有可见文本框先读取几何，再合并一次局部更新，使用原 0.95 步长和 0.5 下限。 */
  measureText() {
    if (this.closed || !this.services.fonts.getSnapshot().ready) return;
    this.cancelFit = this.services.layout.schedule(
      'ppt-text-fit-' + this.id,
      () => {
        const changes: Array<{
          state: FitState;
          tracking: number;
          scale: number;
        }> = [];
        for (const state of this.fits.values()) {
          const element = state.containerRef.current;
          if (
            !state.enabled ||
            !state.fit ||
            state.fit === 'none' ||
            !element?.isConnected
          )
            continue;
          const paragraphs = Array.from(
            element.querySelectorAll<HTMLElement>(
              ':scope > [data-office-presentation-text-paragraph="true"]',
            ),
          );
          if (!paragraphs.length) continue;
          const style = this.document.defaultView!.getComputedStyle(element);
          const available =
            element.clientHeight -
            (parseFloat(style.paddingTop) || 0) -
            (parseFloat(style.paddingBottom) || 0);
          const tolerance = state.fit === 'resizeShape' ? 4 : 1;
          const height = paragraphs.reduce((sum, p) => {
            const s = this.document.defaultView!.getComputedStyle(p);
            return (
              sum +
              p.offsetHeight +
              (parseFloat(s.marginTop) || 0) +
              (parseFloat(s.marginBottom) || 0)
            );
          }, 0);
          if (
            height <= available + tolerance &&
            !paragraphs.some((p) => p.scrollWidth > p.clientWidth + tolerance)
          )
            continue;
          const tracking =
            state.fit === 'resizeShape' && state.tracking === 0
              ? -1
              : state.tracking;
          const scale =
            tracking !== state.tracking
              ? state.scale
              : Math.max(0.5, Math.round(state.scale * 0.95 * 1000) / 1000);
          if (scale !== state.scale || tracking !== state.tracking)
            changes.push({ state, tracking, scale });
        }
        return changes;
      },
      (changes) => {
        if (this.closed) return;
        const owners = new Set<string>();
        for (const item of changes) {
          item.state.scale = item.scale;
          item.state.tracking = item.tracking;
          owners.add(item.state.owner);
        }
        if (owners.size) this.invalidate([...owners]);
      },
    );
  }
  private cancelFit?: () => void;
  private id = Math.random().toString(36).slice(2);
  private dismissMenu = () => {
    this.menu?.remove();
    this.menu = undefined;
    this.document.removeEventListener('pointerdown', this.outside, true);
  };
  private outside = (event: Event) => {
    if (!this.menu?.contains(event.target as Node)) this.dismissMenu();
  };
  private showMenu(
    trigger: HTMLElement,
    x: number,
    y: number,
    actions: ContextMenuAction[],
  ) {
    this.dismissMenu();
    const menu = this.document.createElement('div');
    menu.className = 'fivo-presentation-context-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute(
      'aria-label',
      this.renderContext.locale === 'en-US' ? 'Actions' : '操作菜单',
    );
    const bounds = this.renderContext.container.getBoundingClientRect();
    menu.style.left =
      Math.max(0, Math.min(x - bounds.left, bounds.width - 190)) + 'px';
    menu.style.top =
      Math.max(
        0,
        Math.min(y - bounds.top, bounds.height - actions.length * 32 - 10),
      ) + 'px';
    for (const action of actions) {
      const button = this.document.createElement('button');
      button.type = 'button';
      const label = this.document.createElement('span');
      label.textContent = action.label;
      button.append(createOfficeIcon(this.document, action.icon), label);
      button.setAttribute('role', 'menuitem');
      button.tabIndex = -1;
      button.onclick = () => {
        this.dismissMenu();
        trigger.focus({ preventScroll: true });
        try {
          void Promise.resolve(action.run()).catch(this.renderContext.onError);
        } catch (error) {
          this.renderContext.onError(error);
        }
      };
      menu.append(button);
    }
    menu.onkeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.dismissMenu();
        trigger.focus();
      } else if (event.key === 'Tab') {
        this.dismissMenu();
        trigger.focus({ preventScroll: true });
      } else if (
        ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)
      ) {
        event.preventDefault();
        event.stopPropagation();
        const buttons = Array.from(menu.querySelectorAll('button'));
        const current = buttons.indexOf(
          this.document.activeElement as HTMLButtonElement,
        );
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
            ? buttons.length - 1
            : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
              buttons.length;
        buttons[next]?.focus();
      }
    };
    this.renderContext.container.append(menu);
    this.menu = menu;
    this.document.addEventListener('pointerdown', this.outside, true);
    menu.querySelector('button')?.focus();
  }
  linkProps = (options: {
    hyperlink?: OfficeHyperlink;
    source: OfficeHyperlinkSource;
    interactive?: boolean;
  }): Record<string, unknown> => {
    const { hyperlink, source } = options;
    if (!hyperlink || options.interactive === false) return {};
    let touch = false,
      touchAt = 0;
    const en = this.renderContext.locale === 'en-US';
    const open = (mode: 'mouse' | 'keyboard' | 'touch' | 'context-menu') => {
      void this.services.links.open({ hyperlink, source, mode });
    };
    const menu = (element: HTMLElement, x: number, y: number) => {
      const target = classifyOfficeHyperlink(hyperlink, this.sourceUrl);
      if (
        target.kind === 'blocked' ||
        target.kind === 'host-only' ||
        source.type === 'image'
      )
        return false;
      const actions: ContextMenuAction[] = [
        {
          label: en ? 'Open link' : '打开链接',
          icon: 'openLink',
          run: () => open('context-menu'),
        },
      ];
      if (target.kind === 'new-tab' || target.kind === 'system')
        actions.push({
          label: en ? 'Copy link' : '复制链接',
          icon: 'copy',
          run: async () => {
            const clipboard = this.document.defaultView?.navigator.clipboard;
            if (!clipboard)
              throw new Error(en ? 'Copy link failed' : '复制链接地址失败');
            await clipboard.writeText(target.target);
          },
        });
      this.showMenu(element, x, y, actions);
      return true;
    };
    return {
      role: 'link',
      tabIndex: 0,
      title:
        hyperlink.screenTip ??
        (en ? 'Ctrl/Command + click to open' : 'Ctrl/Command + 单击打开链接'),
      'data-office-hyperlink': 'true',
      onPointerDown: (event: PointerEvent) => {
        touch = event.pointerType === 'touch';
      },
      onClick: (event: MouseEvent) => {
        if (event.button !== 0) return;
        if (touch) {
          touch = false;
          event.preventDefault();
          event.stopPropagation();
          const now = Date.now();
          if (now - touchAt < 4000) {
            touchAt = 0;
            open('touch');
          } else {
            touchAt = now;
            (event.currentTarget as HTMLElement).title = en
              ? 'Tap again to open'
              : '再次点击打开链接';
          }
          return;
        }
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        event.stopPropagation();
        open('mouse');
      },
      onContextMenu: (event: MouseEvent) => {
        if (
          menu(event.currentTarget as HTMLElement, event.clientX, event.clientY)
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          open('keyboard');
        } else if (
          event.key === 'ContextMenu' ||
          (event.shiftKey && event.key === 'F10')
        ) {
          const element = event.currentTarget as HTMLElement,
            rect = element.getBoundingClientRect();
          if (menu(element, rect.left + 24, rect.top + 24)) {
            event.preventDefault();
            event.stopPropagation();
          }
        }
      },
    };
  };
  private targetKey(target: { kind: string; [key: string]: unknown }) {
    return target.kind === 'presentation'
      ? 'presentation:' + target.slideIndex + ':' + target.elementId
      : target.kind === 'word'
      ? 'word:' + target.blockId
      : 'spreadsheet:' +
        target.sheetId +
        ':' +
        target.rowIndex +
        ':' +
        target.columnIndex;
  }
  highlight = (props: {
    text: string;
    target: { kind: string; [key: string]: unknown };
    renderText?: (text: string, start: number, end: number) => DomChild;
  }) => {
    const { text, target } = props;
    const render = props.renderText ?? ((value: string) => value),
      state = this.services.search.getSnapshot(),
      key = this.targetKey(target);
    const matched = state.results.some(
      (result) => this.targetKey(result.target) === key,
    );
    if (!state.query || !matched)
      return createDom(this.document, null, null, render(text, 0, text.length));
    const hits = findSearchMatches(text, {
      text: state.query,
      matchCase: state.matchCase,
      wholeWord: state.wholeWord,
    });
    const current = state.results[state.currentIndex];
    const active = current && this.targetKey(current.target) === key;
    const children: DomChild[] = [];
    let offset = 0;
    for (const hit of hits) {
      if (hit.startOffset > offset)
        children.push(
          render(text.slice(offset, hit.startOffset), offset, hit.startOffset),
        );
      children.push(
        createDom(
          this.document,
          'mark',
          {
            className:
              'office-file-search-highlight' +
              (active ? ' office-file-search-highlight--current' : ''),
            'data-office-search-highlight': 'true',
          },
          render(
            text.slice(hit.startOffset, hit.endOffset),
            hit.startOffset,
            hit.endOffset,
          ),
        ),
      );
      offset = hit.endOffset;
    }
    if (offset < text.length)
      children.push(render(text.slice(offset), offset, text.length));
    return createDom(this.document, null, null, children);
  };
  previewableImage = (props: Record<string, unknown>) => {
    const {
      previewSource,
      previewable = true,
      previewId,
      previewName,
      previewMimeType,
      ...attributes
    } = props;
    const source =
      typeof previewSource === 'string'
        ? { kind: 'url' as const, url: previewSource }
        : (previewSource as OfficeResourceSource);
    const image = createDom(
      this.document,
      'img',
      attributes,
    ) as HTMLImageElement;
    if (!previewable || !props.src) return image;
    // 浮动图片所在图层默认穿透事件，只有可预览图片恢复鼠标交互。
    image.classList.add('office-file-previewable-image');
    image.dataset.officeImagePreviewable = 'true';
    const model = {
      source,
      id: String(previewId),
      name: previewName as string | undefined,
      mimeType: previewMimeType as string | undefined,
      alt: props.alt as string | undefined,
    };
    const open = () => {
      this.closePopup?.();
      void mountImagePreview(model, image, this.renderContext)
        .then((view) => {
          if (this.closed) view.dispose();
          else this.closePopup = view.dispose;
        })
        .catch(this.renderContext.onError);
    };
    image.addEventListener('dblclick', (event) => {
      if (!event.defaultPrevented && !event.ctrlKey && !event.metaKey) open();
    });
    image.addEventListener('keydown', (event) => {
      if (
        !event.defaultPrevented &&
        (event.key === 'Enter' || event.key === ' ')
      ) {
        event.preventDefault();
        open();
      }
    });
    if (!props.role) image.setAttribute('role', 'button');
    if (props.tabIndex === undefined) image.tabIndex = 0;
    image.addEventListener('contextmenu', (event) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      this.showMenu(image, event.clientX, event.clientY, [
        {
          label:
            this.renderContext.locale === 'en-US'
              ? 'Preview image'
              : '预览图片',
          icon: 'preview',
          run: open,
        },
        {
          label:
            this.renderContext.locale === 'en-US'
              ? 'Download image'
              : '下载图片',
          icon: 'download',
          run: () => {
            void downloadOfficeImage(
              image.src,
              { ...model, id: model.id },
              this.document,
            ).catch(this.renderContext.onError);
          },
        },
      ]);
    });
    return image;
  };
  /** 回收离开虚拟窗口的资源所有者，不保留整本工作簿的可见对象租约。 */
  retainOwners(owners: ReadonlySet<string>) {
    for (const [key, record] of this.resources) {
      for (const owner of record.owners)
        if (!owners.has(owner)) record.owners.delete(owner);
      if (!record.owners.size) {
        record.lease?.release();
        this.resources.delete(key);
      }
    }
  }
  annotationMarker = (props: {
    annotation?: { id: string; author?: string; text: string };
  }) => {
    const annotation = props.annotation;
    if (!annotation) return this.document.createDocumentFragment();
    return createDom(this.document, 'button', {
      type: 'button',
      className: 'office-file-spreadsheet-annotation-marker',
      'aria-label': annotation.author
        ? annotation.author + '：' + annotation.text
        : annotation.text,
      'data-office-spreadsheet-annotation': annotation.id,
      'data-active': String(
        this.services.annotations.getSnapshot().activeAnnotation?.id ===
          annotation.id,
      ),
      onClick: (event: MouseEvent) => {
        event.stopPropagation();
        void this.services.annotations.actions.selectId(annotation.id);
      },
    });
  };
  dispose = () => {
    if (this.closed) return;
    this.closed = true;
    this.abort.abort();
    this.unsubscribeFonts();
    this.cancelFit?.();
    this.dismissMenu();
    this.closePopup?.();
    for (const resource of this.resources.values()) resource.lease?.release();
    this.resources.clear();
    this.fits.clear();
    this.renderContext.signal.removeEventListener('abort', this.dispose);
  };
}
