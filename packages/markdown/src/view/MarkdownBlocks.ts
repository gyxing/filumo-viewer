import type { ViewContext } from '@fivo/dom';
import type { MarkdownOptions } from '../options';
import { buildOutline } from '../parser/buildOutline';
import { markdownInlineText } from '../parser/inlineText';
import { resolveMarkdownResource } from '../parser/resolveResource';
import type { MarkdownDocument, MarkdownToken } from '../parser/types';
import { CodeBlock } from './CodeBlock';
import type { HtmlFragment } from './HtmlFragment';
import { MarkdownImage } from './MarkdownImage';
import { MarkdownOutline } from './MarkdownOutline';
import { MarkdownNavigation } from './MarkdownNavigation';
import { MarkdownSearch } from './MarkdownSearch';
import './markdown.less';
let sequence = 0;
/** Markdown 与受控 HTML 构建阅读 DOM，原始节点和事件属性不进入页面。 */
export class MarkdownBlocks {
  readonly element: HTMLDivElement;
  private article: HTMLElement;
  private scroll: HTMLDivElement;
  private outline: MarkdownOutline;
  private navigation?: MarkdownNavigation;
  private search: MarkdownSearch;
  private codes: CodeBlock[] = [];
  private headingNodes = new Map<string, HTMLElement>();
  private targets = new Map<string, HTMLElement>();
  private html?: HtmlFragment;
  private images: MarkdownImage[] = [];
  private imageObserver?: IntersectionObserver;
  private lifetime = new AbortController();
  private active = true;
  private deferred: Array<() => void> = [];
  private prefix = 'fivo-md-' + ++sequence + '-';
  private en: boolean;
  constructor(
    private model: MarkdownDocument,
    private options: MarkdownOptions,
    private context: ViewContext,
    zoom: number,
    private onOutlineChange?: () => void,
    Html?: typeof HtmlFragment,
  ) {
    const document = context.container.ownerDocument;
    this.en = context.options.locale === 'en-US';
    // Worker 不依赖 DOM；进入阅读时用原生实体解码统一目录文字和正文锚点。
    this.model = {
      ...model,
      headings: buildOutline(model.tokens, (value) => this.entities(value)),
    };
    this.element = document.createElement('div');
    this.element.className = 'fivo-markdown-reading';
    const workspace = document.createElement('div');
    workspace.className = 'fivo-markdown-workspace';
    this.scroll = document.createElement('div');
    this.scroll.className = 'fivo-markdown-scroll';
    this.scroll.tabIndex = 0;
    this.article = document.createElement('article');
    this.article.className = 'fivo-markdown-article';
    this.article.style.fontSize = (16 * zoom) / 100 + 'px';
    this.article.style.setProperty('--fivo-md-text-scale', String(zoom / 100));
    if (Html)
      this.html = new Html({
        document,
        prefix: this.prefix,
        renderToken: (token, host) => this.appendTokens([token], host),
        createLink: (reference, title) => this.createLink(reference, title),
        createImage: (reference, caption, title) =>
          this.createImage(reference, caption, title),
        createCode: (source, language) => this.createCode(source, language),
        createCheckbox: (checked, task) => this.createCheckbox(checked, task),
        onLayout: this.invalidateOutline,
      });
    try {
      this.appendTokens(this.model.tokens, this.article);
      if (this.html) {
        const navigation = this.html.navigation(this.article);
        this.model = { ...this.model, headings: navigation.headings };
        this.headingNodes = navigation.headingNodes;
        this.targets = navigation.targets;
      } else this.targets = new Map(this.headingNodes);
    } catch (error) {
      // 片段构建失败时实例尚未交给外壳，必须在这里清理已创建的异步资源。
      this.lifetime.abort();
      this.html?.dispose();
      for (const image of this.images) image.dispose();
      for (const code of this.codes) code.dispose();
      throw error;
    }
    this.scroll.append(this.article);
    this.outline = new MarkdownOutline(
      document,
      this.model.headings,
      (id) => this.navigation?.revealTarget(id),
      this.en,
      () => this.setOutlineOpen(false),
    );
    this.outline.setOpen(
      options.outline !== false && !!this.model.headings.length,
    );
    workspace.append(this.outline.element, this.scroll);
    this.outline.setActive(true);
    this.navigation = new MarkdownNavigation(
      this.scroll, this.article, this.headingNodes, this.targets,
      this.outline, this.model.headings, this.prefix,
    );
    this.search = new MarkdownSearch(
      this.article, this.en,
      (element) => this.navigation?.openAncestors(element),
      (rect, align) => this.navigation?.revealRect(rect, align),
    );
    this.element.append(this.search.element, workspace);
    this.element.onkeydown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        this.showSearch();
      }
      if (event.key === 'Escape') {
        this.search.hide();
        this.scroll.focus({ preventScroll: true });
      }
    };
    const Observer = document.defaultView?.IntersectionObserver;
    if (Observer) {
      this.imageObserver = new Observer(
        (entries) => {
          for (const entry of entries)
            if (entry.isIntersecting) {
              const image = this.images.find(
                (item) => item.container === entry.target,
              );
              if (image) this.loadImage(image);
              this.imageObserver?.unobserve(entry.target);
            }
        },
        { root: this.scroll },
      );
      for (const image of this.images)
        if (this.article.contains(image.container))
          this.imageObserver.observe(image.container);
    } else
      for (const image of this.images) {
        image.element.loading = 'lazy';
        this.loadImage(image);
      }
  }
  private entities(value: string) {
    const document = this.context.container.ownerDocument,
      Parser = document.defaultView?.DOMParser;
    // 仅把匹配的实体片段交给原生解析器，不能传入文档 HTML。
    return Parser
      ? value.replace(
          /&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/gi,
          (entity) =>
            new Parser().parseFromString(entity, 'text/html').body
              .textContent ?? entity,
        )
      : value;
  }
  /** 停用期间只缓存已解析的呈现结果，销毁后直接丢弃，避免迟到资源改写旧节点。 */
  private present(update: () => void) {
    if (this.lifetime.signal.aborted) return;
    if (this.active) {
      update();
      this.invalidateOutline();
    } else this.deferred.push(update);
  }
  private invalidateOutline = () => this.navigation?.invalidate();
  private appendTokens(tokens: readonly MarkdownToken[], parent: HTMLElement) {
    if (tokens.some((token) => token.type === 'html')) {
      if (!this.html) throw new Error('HTML 渲染模块未就绪');
      this.html.append(tokens, parent);
      return;
    }
    const document = parent.ownerDocument;
    for (const token of tokens) {
      let element: HTMLElement | undefined;
      // 引用定义只参与地址解析，不应作为正文再次显示。
      if (token.type === 'space' || token.type === 'def') continue;
      // marked 已提供独立的任务框节点，不在 list_item 中重复创建。
      if (token.type === 'checkbox') {
        parent.append(this.createCheckbox(!!token.checked, true));
        continue;
      }
      if (token.type === 'code') {
        parent.append(this.createCode(token.text ?? '', token.lang ?? ''));
        continue;
      }
      if (token.type === 'table') {
        const wrapper = document.createElement('div');
        wrapper.className = 'fivo-markdown-table';
        const table = document.createElement('table');
        const row = (
          cells: NonNullable<MarkdownToken['header']>,
          head: boolean,
        ) => {
          const tr = document.createElement('tr');
          cells.forEach((cell, index) => {
            const td = document.createElement(head ? 'th' : 'td');
            const align = token.align?.[index];
            if (align && ['left', 'right', 'center'].includes(align))
              td.style.textAlign = align;
            this.appendTokens(cell.tokens, td);
            tr.append(td);
          });
          return tr;
        };
        const head = document.createElement('thead'),
          body = document.createElement('tbody');
        head.append(row(token.header ?? [], true));
        for (const cells of token.rows ?? []) body.append(row(cells, false));
        table.append(head, body);
        wrapper.append(table);
        parent.append(wrapper);
        continue;
      }
      const tags: Record<string, string> = {
        paragraph: 'p',
        strong: 'strong',
        em: 'em',
        del: 'del',
        blockquote: 'blockquote',
        codespan: 'code',
        br: 'br',
        hr: 'hr',
        list_item: 'li',
      };
      if (token.type === 'heading') {
        element = document.createElement(
          'h' + Math.min(6, Math.max(1, token.depth ?? 1)),
        );
        const id = token.headingId ?? '';
        element.id = this.prefix + id;
        this.headingNodes.set(id, element);
      } else if (token.type === 'list') {
        element = document.createElement(token.ordered ? 'ol' : 'ul');
        if (token.ordered && typeof token.start === 'number')
          (element as HTMLOListElement).start = token.start;
      } else if (token.type === 'link' || token.type === 'image') {
        if (token.type === 'image') {
          const caption = token.tokens
            ? markdownInlineText(token.tokens, (value) => this.entities(value))
            : this.entities(token.text ?? '');
          const image = this.createImage(
            this.entities(token.href ?? ''),
            caption,
            this.entities(token.title ?? ''),
          );
          parent.append(image.container);
          continue;
        }
        element = this.createLink(
          this.entities(token.href ?? ''),
          this.entities(token.title ?? ''),
        );
      } else if (tags[token.type])
        element = document.createElement(tags[token.type]);
      if (!element) {
        if (token.tokens) this.appendTokens(token.tokens, parent);
        else
          parent.append(
            document.createTextNode(
              this.entities(token.text ?? token.raw ?? ''),
            ),
          );
        continue;
      }
      if (token.type === 'list_item' && token.task) {
        element.className = 'fivo-markdown-task-item';
      }
      if (
        token.type === 'paragraph' &&
        token.tokens?.some((item) => item.type === 'image') &&
        token.tokens.every((item) =>
          item.type === 'image' || (item.type === 'text' && !item.text?.trim()),
        )
      )
        element.className = 'fivo-markdown-image-paragraph';
      // 行内代码中的实体和空白都是代码本身，不经过普通文字的实体解码。
      if (token.type === 'codespan') element.textContent = token.text ?? '';
      else if (token.items) this.appendTokens(token.items, element);
      else if (token.tokens) this.appendTokens(token.tokens, element);
      else if (!['br', 'hr'].includes(token.type))
        element.append(
          document.createTextNode(this.entities(token.text ?? '')),
        );
      parent.append(element);
    }
  }
  private createCheckbox(checked: boolean, task: boolean) {
    const checkbox = this.context.container.ownerDocument.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = task
      ? 'fivo-markdown-task-checkbox' : 'fivo-markdown-html-checkbox';
    checkbox.checked = checked;
    checkbox.disabled = true;
    checkbox.setAttribute('aria-label', this.en
      ? checked ? 'Completed task' : 'Incomplete task'
      : checked ? '已完成任务' : '未完成任务');
    return checkbox;
  }
  private createCode(source: string, language: string) {
    const code = new CodeBlock(
      this.context.container.ownerDocument,
      source,
      language,
      this.options,
      this.en,
    );
    this.codes.push(code);
    return code.element;
  }
  private createImage(reference: string, caption: string, title: string) {
    const image = new MarkdownImage(
      this.context.container.ownerDocument,
      reference,
      caption,
      title,
      this.en,
      (update) => this.present(update),
    );
    this.images.push(image);
    return image;
  }
  private createLink(reference: string, title: string) {
    const link = this.context.container.ownerDocument.createElement('a');
    link.title = title;
    link.setAttribute('role', 'link');
    link.setAttribute('aria-disabled', 'true');
    void resolveMarkdownResource(
      reference, 'link', this.context.session.source.url,
      this.options, this.lifetime.signal,
    ).then((url) => {
      if (this.lifetime.signal.aborted) return;
      if (!url) {
        this.present(() => this.unavailableLink(link));
        return;
      }
      const id = url.startsWith('#') ? decodeURIComponent(url.slice(1)) : undefined;
      this.present(() => {
        if (id !== undefined) {
          const target = id ? this.navigation?.target(id) : undefined;
          if (id && !target) {
            this.unavailableLink(link, this.en ? 'Heading not found' : '目标章节不存在');
            return;
          }
          link.href = '#' + (target?.id ?? this.prefix);
          link.onclick = (event) => {
            event.preventDefault();
            if (id) this.navigation?.revealTarget(id);
            else {
              this.navigation?.resetTarget();
              this.scroll.scrollTop = 0;
              this.navigation?.schedule();
            }
          };
        } else {
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        }
        link.removeAttribute('aria-disabled');
      });
    }).catch(() => this.present(() => this.unavailableLink(link)));
    return link;
  }
  private unavailableLink(link: HTMLAnchorElement, reason?: string) {
    if (link.dataset.state === 'unavailable') return;
    const message = reason ?? (this.en ? 'Link unavailable' : '链接不可用');
    link.dataset.state = 'unavailable';
    link.setAttribute('aria-disabled', 'true');
    link.title = [link.title, message].filter(Boolean).join('\n');
    const status = link.ownerDocument.createElement('span');
    status.className = 'fivo-markdown-link-status';
    status.dataset.searchExclude = 'true';
    status.textContent = this.en ? ` (${message})` : `（${message}）`;
    link.append(status);
  }
  private loadImage(image: MarkdownImage) {
    if (image.started || this.lifetime.signal.aborted || !this.article.contains(image.container)) return;
    image.started = true;
    void resolveMarkdownResource(
      image.reference,
      'image',
      this.context.session.source.url,
      this.options,
      this.lifetime.signal,
    )
      .then((url) => {
        if (this.lifetime.signal.aborted) return;
        this.present(() => {
          if (url) image.load(url);
          else image.unavailable();
        });
      })
      .catch(() => {
        this.present(() => {
          image.unavailable();
        });
      });
  }
  /** 大纲显隐只改变现有阅读布局，不重新解析原文。 */
  toggleOutline() {
    this.setOutlineOpen(this.outline.element.hidden);
  }
  private setOutlineOpen(open: boolean) {
    const focused = this.outline.element.contains(
      this.context.container.ownerDocument.activeElement,
    );
    this.outline.setOpen(open && this.model.headings.length > 0);
    if (!open) this.navigation?.stopOutlineSync();
    if (!open && focused) this.scroll.focus({ preventScroll: true });
    this.invalidateOutline();
    this.onOutlineChange?.();
  }
  /** 外部大纲按钮显示实际开关状态，无标题的文档不开放空侧栏。 */
  getOutlineState() {
    return {
      available: this.model.headings.length > 0,
      open: !this.outline.element.hidden,
    };
  }
  /** 查找在用户打开并输入之后执行。 */
  showSearch() {
    this.search.show();
  }
  /** 阅读字号不会缩放工具栏和控件。 */
  setZoom(zoom: number) {
    this.article.style.fontSize = (16 * zoom) / 100 + 'px';
    this.article.style.setProperty('--fivo-md-text-scale', String(zoom / 100));
    this.invalidateOutline();
  }
  /** 阅读模式和原文模式分别保存滚动位置。 */
  getPosition() {
    return { top: this.scroll.scrollTop, left: this.scroll.scrollLeft };
  }
  restorePosition(position: { top: number; left: number }) {
    this.navigation?.resetTarget();
    this.scroll.scrollTop = position.top;
    this.scroll.scrollLeft = position.left;
    this.invalidateOutline();
  }
  /** 停用时停止图片、高亮观察和查找任务。 */
  setActive(active: boolean) {
    this.active = active;
    this.outline.setActive(active);
    this.navigation?.setActive(active);
    this.search.setActive(active);
    if (active) {
      this.invalidateOutline();
      const pending = this.deferred;
      this.deferred = [];
      for (const update of pending) this.present(update);
    }
    for (const code of this.codes) code.setActive(active);
    if (!active) {
      this.imageObserver?.disconnect();
    } else
      for (const image of this.images)
        if (!image.started) {
          if (this.imageObserver) this.imageObserver.observe(image.container);
          else this.loadImage(image);
        }
  }
  /** 会话退出后资源回调和异步高亮不能写回页面。 */
  dispose() {
    this.setActive(false);
    this.lifetime.abort();
    this.deferred = [];
    this.navigation?.dispose();
    this.search.dispose();
    this.outline.dispose();
    this.html?.dispose();
    for (const image of this.images) image.dispose();
    for (const code of this.codes) code.dispose();
    this.targets.clear();
    this.headingNodes.clear();
    this.element.remove();
  }
}
