import type { DocumentResourceContext } from '@filumo/core';
import { HtmlFragment, resolveHtmlResource } from '@filumo/dom/html';
import { HtmlSearch } from './HtmlSearch';
import './html.less';

/** 静态 HTML 复用受控节点构造，原始标签和样式定义不进入活动页面。 */
export class HtmlReading {
  readonly element: HTMLElement;
  readonly article: HTMLElement;
  readonly search: HtmlSearch;
  private abort = new AbortController();
  private fragment: HtmlFragment;
  private revision = -1;
  private prefix = 'filumo-html-' + Math.random().toString(36).slice(2) + '-';
  private links = new Map<string, HTMLElement>();
  private images = new Map<HTMLElement, () => void>();
  private observer?: IntersectionObserver;
  private active = true;
  constructor(
    container: HTMLElement,
    private resources: DocumentResourceContext | undefined,
    changed: () => void,
    private en: boolean,
  ) {
    const d = container.ownerDocument;
    this.element = d.createElement('section');
    this.element.className = 'filumo-html-reading';
    this.article = d.createElement('article');
    this.article.className = 'filumo-html-article';
    this.search = new HtmlSearch(this.article, this.element, changed, en);
    this.element.append(this.search.element, this.article);
    container.append(this.element);
    const Observer = d.defaultView?.IntersectionObserver;
    if (Observer)
      this.observer = new Observer(
        (entries) => {
          if (!this.active) return;
          for (const entry of entries)
            if (entry.isIntersecting) {
              this.observer?.unobserve(entry.target);
              this.images.get(entry.target as HTMLElement)?.();
              this.images.delete(entry.target as HTMLElement);
            }
        },
        { root: this.element, rootMargin: '120px' },
      );
    this.fragment = new HtmlFragment({
      document: d,
      prefix: this.prefix,
      onLayout: () => {},
      renderToken: () => {},
      createLink: (reference, title) => {
        const a = d.createElement('a');
        a.href = '#';
        a.textContent = '';
        a.title = title;
        a.setAttribute('aria-disabled', 'true');
        a.onclick = (e) => {
          if (reference.startsWith('#')) {
            e.preventDefault();
            let id = reference.slice(1);
            try {
              id = decodeURIComponent(id);
            } catch {
              /* 非法转义不改变当前位置。 */
            }
            const target = this.links.get(id);
            for (
              let parent = target?.parentElement;
              parent && parent !== this.article;
              parent = parent.parentElement
            )
              if (parent.tagName === 'DETAILS')
                (parent as HTMLDetailsElement).open = true;
            if (target)
              this.element.scrollTop +=
                target.getBoundingClientRect().top -
                this.element.getBoundingClientRect().top -
                16;
            return;
          }
          if (a.getAttribute('aria-disabled') === 'true') e.preventDefault();
        };
        void resolveHtmlResource(
          reference,
          'link',
          this.resources,
          this.abort.signal,
        )
          .then((url) => {
            if (url && !this.abort.signal.aborted) {
              a.href = url;
              a.target = '_blank';
              a.rel = 'noopener noreferrer';
              a.removeAttribute('aria-disabled');
            }
          })
          .catch(() => undefined);
        return a;
      },
      createImage: (reference, caption, title) => {
        const holder = d.createElement('span'),
          img = d.createElement('img');
        holder.className = 'filumo-html-image';
        img.alt = caption;
        img.title = title;
        img.loading = 'lazy';
        holder.append(img);
        this.images.set(holder, () => {
          void resolveHtmlResource(
            reference,
            'image',
            this.resources,
            this.abort.signal,
          )
            .then((url) => {
              if (url && !this.abort.signal.aborted) img.src = url;
              else
                holder.textContent =
                  caption || (this.en ? 'Image unavailable' : '图片不可用');
            })
            .catch(() => {
              holder.textContent = caption;
            });
        });
        return {
          container: holder,
          setDimensions: (width, height) => {
            if (width) img.style.width = width;
            if (height && !width) img.style.maxHeight = height;
          },
        };
      },
      createCode: (source) => {
        const pre = d.createElement('pre'),
          code = d.createElement('code');
        code.textContent = source;
        pre.append(code);
        return pre;
      },
      createCheckbox: (checked) => {
        const input = d.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        input.disabled = true;
        return input;
      },
    });
  }
  update(text: string, revision: number, zoom: number) {
    if (text.length > 2 * 1024 * 1024)
      throw new Error('HTML 超出阅读排版预算，请使用源码模式');
    this.element.style.fontSize = (16 * zoom) / 100 + 'px';
    this.element.style.setProperty(
      '--filumo-md-text-scale',
      String(zoom / 100),
    );
    if (revision === this.revision) return;
    this.revision = revision;
    this.search.clear();
    this.article.replaceChildren();
    this.fragment.append([{ type: 'html', raw: text }], this.article);
    this.links = this.fragment.navigation(this.article).targets;
    this.setActive(this.active);
  }
  /** 不可见阅读模式停止发起新图片解析，恢复时继续观察尚未加载的占位。 */
  setActive(active: boolean) {
    this.active = active;
    this.observer?.disconnect();
    if (!active) return;
    for (const [element, load] of this.images) {
      if (this.observer) this.observer.observe(element);
      else {
        load();
        this.images.delete(element);
      }
    }
  }
  dispose() {
    this.abort.abort();
    this.observer?.disconnect();
    this.images.clear();
    this.search.dispose();
    this.fragment.dispose();
    this.element.remove();
  }
  setLocale(en: boolean) {
    this.en = en;
    this.search.setLocale(en);
  }
}
