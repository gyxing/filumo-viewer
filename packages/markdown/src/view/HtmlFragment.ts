import type { MarkdownToken } from '../parser/types';
import type { MarkdownImage } from './MarkdownImage';
import { collectHtmlNavigation } from './htmlNavigation';
import {
  allowedHtmlStyle,
  allowedHtmlTags,
  blockedHtmlTags,
  htmlDimension,
  HTML_NAMESPACE,
} from './htmlPolicy';

export interface HtmlFragmentOptions {
  document: Document;
  prefix: string;
  renderToken: (token: MarkdownToken, host: HTMLElement) => void;
  createLink: (reference: string, title: string) => HTMLAnchorElement;
  createImage: (reference: string, caption: string, title: string) => MarkdownImage;
  createCode: (source: string, language: string) => HTMLElement;
  createCheckbox: (checked: boolean, task: boolean) => HTMLInputElement;
  onLayout: () => void;
}
interface Slot {
  nodes: Node[];
  raw: string;
}
let sequence = 0;

/** 在惰性 template 中解析片段，只把重建后的文档节点放入阅读区域。 */
export class HtmlFragment {
  private ids = new Map<HTMLElement, string[]>();
  private toggles: HTMLDetailsElement[] = [];
  constructor(private options: HtmlFragmentOptions) {}

  /** 成对 HTML 共用一次片段解析，Markdown 节点通过不可冒充的内部插槽保留。 */
  append(tokens: readonly MarkdownToken[], parent: HTMLElement) {
    const raw = tokens
      .filter((token) => token.type === 'html')
      .map((token) => token.raw ?? token.text ?? '')
      .join('');
    const reserved = new Set<string>();
    // 一次扫描排除文档占用的标记，避免注释冒充插槽，也避免反复扫描长 HTML。
    for (const match of raw.matchAll(/filumo-md-slot-(\d{1,16}):/g))
      reserved.add(match[1]);
    do {
      sequence++;
    } while (reserved.has(String(sequence)));
    const marker = 'filumo-md-slot-' + sequence + ':';
    const slots = new Map<string, Slot>();
    const markup = tokens.map((token, index) => {
      if (token.type === 'html') return token.raw ?? token.text ?? '';
      const holder = this.options.document.createElement('div');
      this.options.renderToken(token, holder);
      const key = marker + index;
      slots.set(key, {
        nodes: Array.from(holder.childNodes),
        raw: token.raw ?? token.text ?? '',
      });
      return '<!--' + key + '-->';
    }).join('');
    const template = this.options.document.createElement('template');
    // template.content 保持惰性；原始节点从不接入活跃文档，也不直接复制资源属性。
    template.innerHTML = markup;
    const stack: Array<{ source: Node; parent: HTMLElement }> = [];
    for (let index = template.content.childNodes.length - 1; index >= 0; index--)
      stack.push({ source: template.content.childNodes[index], parent });
    while (stack.length) {
      const work = stack.pop()!;
      this.copy(work.source, work.parent, slots, stack);
    }
  }
  private copy(
    source: Node,
    parent: HTMLElement,
    slots: ReadonlyMap<string, Slot>,
    stack: Array<{ source: Node; parent: HTMLElement }>,
  ) {
    const { document } = this.options;
    if (source.nodeType === 3) {
      parent.append(document.createTextNode(source.textContent ?? ''));
      return;
    }
    if (source.nodeType === 8) {
      const slot = slots.get(source.nodeValue ?? '');
      if (slot) for (const node of slot.nodes) parent.append(node);
      return;
    }
    if (source.nodeType !== 1) return;
    const element = source as HTMLElement,
      tag = element.tagName.toLowerCase();
    if (element.namespaceURI !== HTML_NAMESPACE || blockedHtmlTags.has(tag)) return;
    let target = parent;
    if (allowedHtmlTags.has(tag)) {
      if (tag === 'img') {
        const image = this.options.createImage(
          element.getAttribute('src') ?? '',
          element.getAttribute('alt') ?? '',
          element.getAttribute('title') ?? '',
        );
        image.setDimensions(
          htmlDimension(element.style.width || element.getAttribute('width')),
          htmlDimension(element.style.height || element.getAttribute('height')),
        );
        this.attributes(element, image.container, tag);
        parent.append(image.container);
        return;
      }
      if (tag === 'pre') {
        const child = element.querySelector('code');
        const code = child?.namespaceURI === HTML_NAMESPACE ? child : undefined;
        const language = code?.getAttribute('data-language') ??
          element.getAttribute('data-language') ??
          code?.className.match(/(?:^|\s)language-([\w#+.-]+)/)?.[1] ??
          element.className.match(/(?:^|\s)language-([\w#+.-]+)/)?.[1] ??
          element.getAttribute('lang') ?? '';
        target = this.options.createCode(this.text(element, slots), language);
        this.attributes(element, target, tag);
        const renderedCode = target.querySelector('pre > code');
        if (code && renderedCode)
          this.attributes(code, renderedCode as HTMLElement, 'code');
        parent.append(target);
        return;
      }
      if (tag === 'input') {
        if (element.getAttribute('type')?.toLowerCase() !== 'checkbox') return;
        const item = parent.tagName === 'LI' ? parent
          : parent.tagName === 'P' && parent.parentElement?.tagName === 'LI'
          ? parent.parentElement : undefined;
        if (item) item.classList.add('filumo-markdown-task-item');
        target = this.options.createCheckbox(element.hasAttribute('checked'), !!item);
      } else if (tag === 'a') {
        target = element.hasAttribute('href')
          ? this.options.createLink(element.getAttribute('href') ?? '', element.title)
          : document.createElement('a');
      } else {
        target = document.createElement(tag === 'font' ? 'span' : tag === 'center' ? 'div' : tag === 'strike' ? 'del' : tag);
        if (tag === 'center') target.style.textAlign = 'center';
      }
      this.attributes(element, target, tag);
      if (tag === 'table') {
        const wrapper = document.createElement('div');
        wrapper.className = 'filumo-markdown-table';
        wrapper.append(target);
        parent.append(wrapper);
      } else parent.append(target);
      if (tag === 'details') {
        const details = target as HTMLDetailsElement;
        details.open = element.hasAttribute('open');
        details.addEventListener('toggle', this.options.onLayout);
        this.toggles.push(details);
      }
    }
    // 未支持的普通容器保留内部可读内容，原始元素与属性不进入页面。
    for (let index = source.childNodes.length - 1; index >= 0; index--)
      stack.push({ source: source.childNodes[index], parent: target });
  }
  private text(source: Node, slots: ReadonlyMap<string, Slot>) {
    let text = '';
    const stack = Array.from(source.childNodes).reverse();
    while (stack.length) {
      const node = stack.pop()!;
      if (node.nodeType === 3) text += node.textContent ?? '';
      else if (node.nodeType === 8) text += slots.get(node.nodeValue ?? '')?.raw ?? '';
      else for (let index = node.childNodes.length - 1; index >= 0; index--)
        stack.push(node.childNodes[index]);
    }
    return text;
  }
  // 只复制文档语义和局部排版属性；资源地址通过现有解析器处理。
  private attributes(source: HTMLElement, target: HTMLElement, tag: string) {
    const aliases = [source.getAttribute('id'), tag === 'a' ? source.getAttribute('name') : null]
      .filter((value): value is string => !!value && value.length <= 1024);
    if (aliases.length) {
      target.id = this.options.prefix + aliases[0];
      this.ids.set(target, aliases);
    }
    if (source.title) target.title = source.title;
    const direction = source.getAttribute('dir')?.trim().toLowerCase();
    if (direction && /^(ltr|rtl|auto)$/.test(direction)) target.dir = direction;
    const language = source.getAttribute('lang');
    if (language && /^[\w-]{1,40}$/.test(language)) target.lang = language;
    const align = source.getAttribute('align')?.trim().toLowerCase(),
      vertical = source.getAttribute('valign')?.trim().toLowerCase();
    if (align && allowedHtmlStyle('text-align', align)) target.style.textAlign = align;
    if (vertical && allowedHtmlStyle('vertical-align', vertical)) target.style.verticalAlign = vertical;
    for (let index = 0; index < source.style.length; index++) {
      const property = source.style.item(index), value = source.style.getPropertyValue(property).trim();
      if (tag === 'img' && ['width', 'height'].includes(property)) continue;
      if (allowedHtmlStyle(property, value)) {
        if (property === 'max-width' && !['table', 'col', 'colgroup'].includes(tag)) {
          const width = htmlDimension(value);
          if (width) target.style.maxWidth = `min(100%, ${width})`;
          continue;
        }
        // 绝对字号随阅读缩放，em 和百分比继续通过继承缩放，避免重复放大。
        const rendered = property === 'font-size' && /(?:px|pt|rem)$/.test(value)
          ? `calc(${value} * var(--filumo-md-text-scale, 1))` : value;
        target.style.setProperty(property, rendered);
      }
    }
    const color = source.getAttribute('color'), background = source.getAttribute('bgcolor');
    if (color && !target.style.color && allowedHtmlStyle('color', color)) target.style.color = color;
    if (background && !target.style.backgroundColor && allowedHtmlStyle('background-color', background))
      target.style.backgroundColor = background;
    if (tag === 'font') {
      const face = source.getAttribute('face'), size = source.getAttribute('size');
      if (face && !target.style.fontFamily && allowedHtmlStyle('font-family', face)) target.style.fontFamily = face;
      // 老文档的 font size 以 1～7 为级别，正负值相对默认第 3 级。
      if (size && /^[+-]?[1-7]$/.test(size) && !target.style.fontSize) {
        const level = /^[+-]/.test(size) ? 3 + Number(size) : Number(size);
        target.style.fontSize = ['0.625em', '0.8125em', '1em', '1.125em', '1.5em', '2em', '3em'][Math.max(1, Math.min(7, level)) - 1];
      }
    }
    if (tag !== 'img') {
      const width = htmlDimension(source.getAttribute('width')),
        height = htmlDimension(source.getAttribute('height'));
      if (width && !target.style.width) target.style.width = width;
      if (height && !target.style.height) target.style.height = height;
      if (!['table', 'col', 'colgroup'].includes(tag) && target.style.width && !target.style.maxWidth)
        target.style.maxWidth = '100%';
      if (!['table', 'col', 'colgroup'].includes(tag) && target.style.width)
        target.style.boxSizing = 'border-box';
    }
    const integer = (name: string, min: number, max: number) => {
      const value = source.getAttribute(name);
      if (value && /^-?\d{1,10}$/.test(value))
        target.setAttribute(name, String(Math.max(min, Math.min(max, Number(value)))));
    };
    if (tag === 'td' || tag === 'th') {
      integer('colspan', 1, 1000);
      integer('rowspan', 0, 1000);
      const scope = source.getAttribute('scope')?.trim().toLowerCase();
      if (scope && /^(row|col|rowgroup|colgroup)$/.test(scope)) target.setAttribute('scope', scope);
      const headers = source.getAttribute('headers');
      if (headers && headers.length <= 2048)
        target.setAttribute('headers', headers.trim().split(/\s+/).map((id) => this.options.prefix + id).join(' '));
    }
    if (tag === 'col' || tag === 'colgroup') integer('span', 1, 1000);
    if (tag === 'ol') {
      integer('start', -2147483648, 2147483647);
      if (source.hasAttribute('reversed')) target.setAttribute('reversed', '');
    }
    if (tag === 'li') integer('value', -2147483648, 2147483647);
  }
  /** 全部受控节点就绪后登记标题和锚点，支持前向链接及混合顺序。 */
  navigation(article: HTMLElement) {
    // 行内 HTML 可以在 Markdown 的 li 完成挂载后才确定是否属于任务项。
    for (const checkbox of article.querySelectorAll<HTMLInputElement>('.filumo-markdown-html-checkbox')) {
      const parent = checkbox.parentElement;
      const item = parent?.tagName === 'LI' ? parent
        : parent?.tagName === 'P' && parent.parentElement?.tagName === 'LI'
        ? parent.parentElement : undefined;
      if (item) {
        item.classList.add('filumo-markdown-task-item');
        checkbox.className = 'filumo-markdown-task-checkbox';
      }
    }
    return collectHtmlNavigation(article, this.options.prefix, this.ids);
  }
  /** 移除折叠监听，不保留对已销毁阅读区域的引用。 */
  dispose() {
    for (const element of this.toggles)
      element.removeEventListener('toggle', this.options.onLayout);
    this.toggles = [];
    this.ids.clear();
  }
}
