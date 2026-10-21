import { textLineAt } from '@filumo/core/text';
import type { TextDocument, TextMatch } from '@filumo/core/text';
import { textSegments, type TextHit } from './textSegments';
import { textViewportFlags } from './internalFlags';
import type { TextSurfaceOptions, TextSurfacePosition } from './types';

/** 行高使用前缀索引，换行后的测量变化保留当前逻辑行锚点。 */
class LineHeights {
  private values: Float64Array;
  private tree: Float64Array;
  constructor(readonly count: number, initial: number) {
    this.values = new Float64Array(count).fill(initial);
    this.tree = new Float64Array(count + 1);
    for (let i = 1; i <= count; i++) this.tree[i] = (i & -i) * initial;
  }
  sum(end: number) {
    let value = 0;
    for (let i = end; i > 0; i -= i & -i) value += this.tree[i];
    return value;
  }
  set(index: number, value: number) {
    const delta = value - this.values[index];
    if (Math.abs(delta) < 0.5) return false;
    this.values[index] = value;
    for (let i = index + 1; i <= this.count; i += i & -i) this.tree[i] += delta;
    return true;
  }
  at(position: number) {
    let index = 0,
      value = 0,
      bit = 1;
    while (bit * 2 <= this.count) bit *= 2;
    for (; bit; bit >>>= 1) {
      const next = index + bit;
      if (next <= this.count && value + this.tree[next] <= position) {
        index = next;
        value += this.tree[next];
      }
    }
    return Math.min(this.count - 1, index);
  }
}

/** 原文只渲染可见逻辑行，行号不参与选择和复制。 */
export class TextViewport {
  readonly element: HTMLDivElement;
  private canvas: HTMLDivElement;
  private gutterFill: HTMLDivElement;
  private heights: LineHeights;
  private resize?: ResizeObserver;
  private containerResize?: ResizeObserver;
  private frame?: number;
  private closed = false;
  private active = true;
  private width = 0;
  private matches: readonly TextMatch[] = [];
  private current = -1;
  private revealed?: { start: number; end: number };
  constructor(
    private model: TextDocument,
    private options: TextSurfaceOptions,
    private document: Document,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'filumo-text-viewport';
    this.element.tabIndex = 0;
    this.element.setAttribute(
      'aria-label',
      options.locale === 'en-US' ? 'Text content' : '文本内容',
    );
    this.canvas = document.createElement('div');
    this.canvas.className = 'filumo-text-canvas';
    this.gutterFill = document.createElement('div');
    this.gutterFill.className = 'filumo-text-gutter-fill';
    // 延续数字只作视觉装饰，不创建内容行，也不进入复制、检索和可访问文本。
    this.gutterFill.setAttribute('aria-hidden', 'true');
    this.element.append(this.canvas, this.gutterFill);
    this.heights = new LineHeights(model.lineStarts.length, this.rowHeight());
    const Resize = document.defaultView?.ResizeObserver;
    if (Resize) {
      this.resize = new Resize((entries) => {
        if (!this.active || this.closed) return;
        const anchor = this.heights.at(this.element.scrollTop),
          within = this.element.scrollTop - this.heights.sum(anchor);
        let changed = false;
        for (const entry of entries) {
          const row = entry.target as HTMLElement,
            index = Number(row.dataset.line);
          if (row.isConnected && Number.isInteger(index))
            changed =
              this.heights.set(index, row.getBoundingClientRect().height) ||
              changed;
        }
        if (changed) {
          this.resizeCanvas();
          this.element.scrollTop = this.heights.sum(anchor) + within;
          this.schedule();
        }
      });
      this.containerResize = new Resize(() => {
        if (!this.active || this.closed) return;
        const width = this.element.clientWidth;
        if (width !== this.width && width > 0) {
          this.width = width;
          this.resetHeights();
        }
        // 容器变化时先补齐画布，再等待下一帧重建可见行，避免短文件底色滞后。
        this.resizeCanvas();
        this.schedule();
      });
      this.containerResize.observe(this.element);
    }
    this.element.onscroll = this.schedule;
    this.schedule();
  }
  private rowHeight() {
    return (22 * (this.options.zoom ?? 100)) / 100;
  }
  /** 装饰区至少铺满视口，实际行高索引和源文件行数不增加空白记录。 */
  private resizeCanvas() {
    const contentHeight = this.heights.sum(this.model.lineStarts.length),
      emptyHeight = Math.max(0, this.element.clientHeight - contentHeight);
    this.canvas.style.height =
      Math.max(this.element.clientHeight, contentHeight) + 'px';
    this.gutterFill.style.top = contentHeight + 'px';
    this.gutterFill.style.height = emptyHeight + 'px';
    this.gutterFill.hidden =
      !textViewportFlags.extendLineNumbersToViewport ||
      this.options.lineNumbers !== true ||
      emptyHeight <= 0;
  }
  /** 仅填充末行之后的可见空白，折行使用已测行高，末尾不足一行的部分由样式裁切。 */
  private fillLineCount() {
    if (
      !textViewportFlags.extendLineNumbersToViewport ||
      this.options.lineNumbers !== true
    )
      return 0;
    const remaining =
      this.element.clientHeight - this.heights.sum(this.model.lineStarts.length);
    return Math.max(0, Math.ceil(remaining / this.rowHeight()));
  }
  /** 补充的数字不挂载到虚拟内容画布，避免增加文件行数及滚动范围。 */
  private renderGutterFill() {
    this.gutterFill.replaceChildren();
    const count = this.fillLineCount();
    for (let index = 0; index < count; index++) {
      const number = this.document.createElement('span');
      number.className = 'filumo-text-filler-number';
      number.textContent = String(this.model.lineStarts.length + index + 1);
      number.style.height = this.rowHeight() + 'px';
      this.gutterFill.append(number);
    }
  }
  private resetHeights() {
    const anchor = Math.min(
      this.model.lineStarts.length - 1,
      this.heights.at(this.element.scrollTop),
    );
    this.heights = new LineHeights(
      this.model.lineStarts.length,
      this.rowHeight(),
    );
    this.element.scrollTop = this.heights.sum(anchor);
  }
  private schedule = () => {
    if (!this.active || this.closed || this.frame !== undefined) return;
    this.frame = this.document.defaultView?.requestAnimationFrame(() => {
      this.frame = undefined;
      this.render();
    });
    if (!this.document.defaultView) this.render();
  };
  private render() {
    if (this.closed || !this.active) return;
    this.resize?.disconnect();
    this.canvas.replaceChildren();
    const start = Math.max(0, this.heights.at(this.element.scrollTop) - 4);
    const end = Math.min(
      this.model.lineStarts.length,
      this.heights.at(
        this.element.scrollTop + (this.element.clientHeight || 400),
      ) + 6,
    );
    this.resizeCanvas();
    this.element.dataset.wrap = String(this.options.wrap !== false);
    this.element.dataset.lineNumbers = String(
      this.options.lineNumbers === true,
    );
    const scale = (this.options.zoom ?? 100) / 100;
    this.element.style.fontSize = 14 * scale + 'px';
    this.element.style.lineHeight = this.rowHeight() + 'px';
    // 延续数字同样计入栏宽，避免文件只有个位数行而视口已经显示两位数行号时错位。
    const digits = String(
      this.model.lineStarts.length + this.fillLineCount(),
    ).length;
    this.element.style.setProperty(
      '--filumo-text-gutter-width',
      `max(${56 * scale}px, calc(${digits}ch + ${20 * scale + 1}px))`,
    );
    this.element.style.setProperty(
      '--filumo-text-gutter-padding',
      10 * scale + 'px',
    );
    for (let line = start; line < end; line++) {
      const row = this.document.createElement('div');
      row.className = 'filumo-text-row';
      row.dataset.line = String(line);
      row.style.top = this.heights.sum(line) + 'px';
      const number = this.document.createElement('span');
      number.className = 'filumo-text-line-number';
      number.textContent = String(line + 1);
      number.hidden = this.options.lineNumbers !== true;
      number.setAttribute('aria-hidden', 'true');
      const text = this.document.createElement('span');
      text.className = 'filumo-text-line-content';
      const offset = this.model.lineStarts[line];
      const value = this.model.text
        .slice(
          offset,
          this.model.lineStarts[line + 1] ?? this.model.text.length,
        )
        .replace(/[\r\n]+$/, '');
      // 命中按源位置排序，避免滚到文件末尾时逐行重扫所有历史命中。
      let lower = 0,
        upper = this.matches.length;
      while (lower < upper) {
        const middle = (lower + upper) >>> 1;
        if (this.matches[middle].end <= offset) lower = middle + 1;
        else upper = middle;
      }
      const hits: TextHit[] = [];
      for (let index = lower; index < this.matches.length; index++) {
        const hit = this.matches[index];
        if (hit.end <= offset) continue;
        if (hit.start >= offset + value.length) break;
        hits.push({ ...hit, current: index === this.current });
      }
      const endOffset = offset + value.length;
      for (const segment of textSegments(
        offset,
        endOffset,
        this.options.decorateLine?.(offset, endOffset) ?? [],
        hits,
        this.revealed,
      )) {
        let content: Node = this.document.createTextNode(
          this.model.text.slice(segment.start, segment.end),
        );
        if (segment.className) {
          const span = this.document.createElement('span');
          span.className = segment.className;
          span.append(content);
          content = span;
        }
        if (segment.emphasis) {
          const mark = this.document.createElement(
            segment.emphasis === 'reveal' ? 'span' : 'mark',
          );
          mark.className =
            segment.emphasis === 'current'
              ? 'filumo-text-hit-current'
              : segment.emphasis === 'reveal'
              ? 'filumo-text-reveal'
              : 'filumo-text-hit';
          mark.append(content);
          content = mark;
        }
        text.append(content);
      }
      if (!value) text.append(this.document.createElement('br'));
      row.append(number, text);
      this.canvas.append(row);
      this.resize?.observe(row);
    }
    this.renderGutterFill();
  }
  /** 新文件或字号变化时重建行高，逻辑行锚点继续有效。 */
  update(model: TextDocument, options: TextSurfaceOptions) {
    if (model !== this.model) {
      this.matches = [];
      this.current = -1;
      this.revealed = undefined;
    }
    const changed =
      this.model !== model ||
      this.options.zoom !== options.zoom ||
      this.options.wrap !== options.wrap ||
      this.options.lineNumbers !== options.lineNumbers;
    this.element.setAttribute(
      'aria-label',
      options.locale === 'en-US' ? 'Text content' : '文本内容',
    );
    this.model = model;
    this.options = options;
    if (changed) this.resetHeights();
    this.schedule();
  }
  /** 逻辑行锚点可在换行行高尚未重新测量时恢复，避免保存的像素位置被截断。 */
  getPosition(): TextSurfacePosition {
    const line = this.heights.at(this.element.scrollTop);
    return {
      top: this.element.scrollTop,
      left: this.element.scrollLeft,
      line,
      within: this.element.scrollTop - this.heights.sum(line),
    };
  }
  restorePosition(position: TextSurfacePosition) {
    this.resizeCanvas();
    const line = Math.max(
      0,
      Math.min(this.model.lineStarts.length - 1, position.line ?? 0),
    );
    this.element.scrollTop =
      position.line === undefined
        ? position.top
        : this.heights.sum(line) + (position.within ?? 0);
    this.element.scrollLeft = position.left;
    this.schedule();
  }
  /** 高亮始终使用源字符范围，跨行匹配只标记当前行内部分。 */
  highlight(matches: readonly TextMatch[], current: number) {
    this.matches = matches;
    this.current = current;
    this.schedule();
  }
  /** 定位逻辑行，避免等待尚未创建的 DOM 节点。 */
  goTo(offset: number) {
    const line = textLineAt(this.model, offset);
    this.resizeCanvas();
    this.element.scrollTop = this.heights.sum(line);
    this.schedule();
  }
  /** 结构视图定位只改变滚动和背景，不抢走当前键盘焦点。 */
  revealRange(range: { start: number; end: number }) {
    if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) return;
    const start = Math.max(0, Math.min(this.model.text.length, range.start)),
      end = Math.max(start, Math.min(this.model.text.length, range.end));
    this.revealed = { start, end };
    this.goTo(start);
  }
  /** 停用时停止测量和帧任务，恢复后按当前容器尺寸重建。 */
  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    if (!active) {
      this.resize?.disconnect();
      this.containerResize?.disconnect();
      if (this.frame !== undefined)
        this.document.defaultView?.cancelAnimationFrame(this.frame);
      this.frame = undefined;
    } else {
      this.containerResize?.observe(this.element);
      this.resetHeights();
      this.schedule();
    }
  }
  /** 清理可见行与容器观察器。 */
  dispose() {
    this.setActive(false);
    this.closed = true;
    this.containerResize?.disconnect();
    this.element.remove();
  }
}
