/** 图片占位与错误提示保持在原位置，小图和行内图标不强制放大。 */
export class MarkdownImage {
  readonly element: HTMLImageElement;
  readonly container: HTMLSpanElement;
  // 停用恢复时不重复解析或请求同一图片。
  started = false;
  private status: HTMLElement;
  private dimensions?: { width?: string; height?: string };
  constructor(
    document: Document,
    readonly reference: string,
    private caption: string,
    title: string,
    private en: boolean,
    private present: (update: () => void) => void,
  ) {
    this.container = document.createElement('span');
    this.container.className = 'fivo-markdown-image-holder';
    this.container.dataset.state = 'pending';
    this.element = document.createElement('img');
    this.element.className = 'fivo-markdown-image';
    this.element.alt = caption;
    this.element.title = title;
    this.element.decoding = 'async';
    this.element.hidden = true;
    this.status = document.createElement('span');
    this.status.className = 'fivo-markdown-image-status';
    // 占位和错误提示不属于文档正文，避免被查找命中。
    this.status.dataset.searchExclude = 'true';
    this.status.setAttribute('role', 'status');
    this.status.textContent = caption
      ? caption + (en ? ' (image pending)' : '（图片待加载）')
      : en
      ? 'Image pending'
      : '图片待加载';
    this.container.append(this.element, this.status);
  }
  /** 地址解析成功后才发起请求，晚到事件通过阅读视图的生命周期处理。 */
  load(url: string) {
    this.element.onload = () =>
      this.present(() => {
        this.applyDimensions();
        this.element.hidden = false;
        this.status.hidden = true;
        this.container.dataset.state = 'ready';
      });
    this.element.onerror = () => this.present(() => this.unavailable());
    this.element.src = url;
  }
  /** HTML 尺寸作为阅读尺寸使用，容器缩小时仍保持指定或自然宽高比例。 */
  setDimensions(width?: string, height?: string) {
    this.dimensions = { width, height };
    if (width?.endsWith('%')) {
      this.container.style.width = width;
      this.element.style.width = '100%';
    } else if (width) this.element.style.width = width;
  }
  private applyDimensions() {
    if (!this.dimensions) return;
    const { width, height } = this.dimensions;
    const window = this.element.ownerDocument.defaultView;
    const pixels = (value?: string) => {
      const match = value?.match(/^(\d+(?:\.\d+)?)(px|pt|em|rem)$/);
      if (!match) return 0;
      const size = Number(match[1]);
      const font = match[2] === 'rem'
        ? this.element.ownerDocument.documentElement : this.element;
      return size * (match[2] === 'pt' ? 4 / 3
        : match[2] === 'em' || match[2] === 'rem'
        ? parseFloat(window?.getComputedStyle(font).fontSize ?? '16') : 1);
    };
    const requestedHeight = pixels(height);
    if (width && requestedHeight) {
      const requestedWidth = width.endsWith('%') ? this.container.clientWidth : pixels(width);
      if (requestedWidth) this.element.style.aspectRatio = `${requestedWidth} / ${requestedHeight}`;
    } else if (requestedHeight && this.element.naturalHeight)
      this.element.style.width = requestedHeight * this.element.naturalWidth / this.element.naturalHeight + 'px';
  }
  /** 解析失败和下载失败共用明确的占位提示，避免无说明的空白。 */
  unavailable() {
    this.element.hidden = true;
    this.container.dataset.state = 'unavailable';
    this.status.hidden = false;
    this.status.textContent =
      (this.en ? 'Image unavailable' : '图片不可用') +
      (this.caption ? (this.en ? ': ' : '：') + this.caption : '');
    this.status.title = this.reference;
  }
  /** 清理原生图片事件，销毁后不再向阅读视图排队更新。 */
  dispose() {
    this.element.onload = this.element.onerror = null;
  }
}
