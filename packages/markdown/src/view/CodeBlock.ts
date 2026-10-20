import { normalizeLanguage } from '../highlight/languages';
import type { MarkdownOptions } from '../options';
/** 原始代码先可读可复制，着色作为可见时的异步增强。 */
export class CodeBlock {
  readonly element: HTMLElement;
  private code: HTMLElement;
  private observer?: IntersectionObserver;
  private active = true;
  private closed = false;
  private version = 0;
  private highlighted = false;
  private pending = false;
  private retry: HTMLButtonElement;
  constructor(
    private document: Document,
    private source: string,
    private language: string,
    private options: MarkdownOptions,
    en: boolean,
  ) {
    this.element = document.createElement('section');
    this.element.className = 'fivo-markdown-code';
    this.element.dataset.language = language;
    const header = document.createElement('div');
    header.className = 'fivo-markdown-code-tools';
    header.dataset.searchExclude = 'true';
    const name = document.createElement('span');
    name.textContent = language || (en ? 'Code' : '代码');
    name.title = name.textContent;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = en ? 'Copy' : '复制';
    copy.onclick = () => {
      const clipboard = document.defaultView?.navigator.clipboard;
      if (!clipboard) {
        copy.textContent = en ? 'Copy unavailable' : '无法复制';
        return;
      }
      void clipboard.writeText(source).then(
        () => {
          if (!this.closed && this.active)
            copy.textContent = en ? 'Copied' : '已复制';
        },
        () => {
          if (!this.closed && this.active)
            copy.textContent = en ? 'Copy failed' : '复制失败';
        },
      );
    };
    const pre = document.createElement('pre');
    this.code = document.createElement('code');
    this.code.textContent = source;
    pre.append(this.code);
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = en ? 'Retry highlight' : '重试高亮';
    retry.hidden = true;
    this.retry = retry;
    retry.onclick = () => {
      retry.hidden = true;
      this.enhance(retry);
    };
    header.append(name, copy, retry);
    this.element.append(header, pre);
    const Observer = document.defaultView?.IntersectionObserver;
    if (Observer) {
      this.observer = new Observer((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) this.enhance(retry);
      });
      this.observer.observe(this.element);
    } else this.observeVisible();
  }
  private enhance(retry: HTMLButtonElement) {
    if (
      this.closed ||
      !this.active ||
      this.highlighted ||
      this.pending ||
      this.options.highlight === false ||
      this.source.length > (this.options.maxHighlightChars ?? 65536) ||
      !normalizeLanguage(this.language)
    )
      return;
    this.pending = true;
    const version = ++this.version;
    void import('../highlight/loadHighlighter')
      .then((module) => module.loadHighlighter(this.language))
      .then(async (highlighter) => {
        if (
          !highlighter ||
          this.closed ||
          !this.active ||
          version !== this.version
        )
          return;
        const { renderHighlight } = await import(
          '../highlight/renderHighlight'
        );
        if (this.closed || !this.active || version !== this.version) return;
        const fragment = renderHighlight(
          this.document,
          highlighter.highlight(this.source, this.language).html,
          this.source,
        );
        // 高亮只能改变样式，转换不一致时保留完整原文。
        if (fragment.textContent === this.source) {
          this.code.replaceChildren(fragment);
          this.highlighted = true;
          this.element.dataset.highlighted = 'true';
        }
      })
      .catch(() => {
        if (!this.closed && this.active && version === this.version)
          retry.hidden = false;
      })
      .finally(() => {
        this.pending = false;
        if (version !== this.version && this.active && !this.closed)
          this.observeVisible();
      });
  }
  private observeVisible() {
    if (this.observer) {
      this.observer.unobserve(this.element);
      this.observer.observe(this.element);
      return;
    }
    this.document.defaultView?.requestAnimationFrame(() => {
      if (this.closed || !this.active || !this.element.isConnected) return;
      const rect = this.element.getBoundingClientRect();
      if (
        rect.bottom >= 0 &&
        rect.top < (this.document.defaultView?.innerHeight ?? 0)
      )
        this.enhance(this.retry);
    });
  }
  /** 模式停用后迟到增强无效，恢复可再次观察未处理的代码块。 */
  setActive(active: boolean) {
    this.active = active;
    if (!active) {
      this.version++;
      this.observer?.disconnect();
    } else this.observeVisible();
  }
  /** 释放观察器并使所有迟到结果失效。 */
  dispose() {
    this.closed = true;
    this.setActive(false);
    this.element.remove();
  }
}
