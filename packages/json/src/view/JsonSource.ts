import type { StylePolicy, ViewOptions } from '@filumo/dom';
import type { TextDocument } from '@filumo/core/text';
import type { TextSurfaceHandle, TextSurfacePosition } from '@filumo/dom/text';
import type { TextDecoration } from '@filumo/dom/text';
import type { JsonCommentRange } from './sourceComments';
import { mountTextSurface } from '@filumo/dom/text';
import { jsonLineDecorations } from './jsonTokens';
import './source.less';

/** JSON 代码区只提供原生行着色，结构扫描和树均不在此入口加载。 */
export class JsonSource {
  private surface: TextSurfaceHandle;
  private comments?: readonly JsonCommentRange[];
  private commenting = new AbortController();
  private commentPending = false;
  private active = true;
  private closed = false;
  private currentOptions: ViewOptions;
  private currentZoom: number;
  constructor(
    container: HTMLElement,
    private model: TextDocument,
    options: ViewOptions,
    zoom: number,
    private policy?: StylePolicy,
    private syntax: 'json' | 'jsonc' = 'json',
    private onMatch?: (range: { start: number; end: number }) => void,
    private getLineNumbers: () => boolean = () => true,
  ) {
    this.currentOptions = options;
    this.currentZoom = zoom;
    this.surface = mountTextSurface(
      container,
      model,
      this.options(options, zoom),
    );
    this.enhanceComments();
  }
  private options(options: ViewOptions, zoom: number) {
    return {
      ...options,
      zoom,
      // 每次更新都读取会话偏好，异步着色完成后也不能覆盖工具栏选择。
      lineNumbers: this.getLineNumbers(),
      watermark: undefined,
      stylePolicy: this.policy,
      maxMatches: 10000,
      onMatch: this.onMatch,
      decorateLine: (start: number, end: number) =>
        this.decorations(start, end),
    };
  }
  /** 字号和语言更新不改变原始文件或解析结果。 */
  update(options: ViewOptions, zoom: number) {
    this.currentOptions = options;
    this.currentZoom = zoom;
    this.surface.update(this.model, this.options(options, zoom));
    this.enhanceComments();
  }
  private decorations(start: number, end: number): readonly TextDecoration[] {
    if (this.syntax !== 'jsonc')
      return jsonLineDecorations(this.model.text, start, end);
    if (!this.comments) return [];
    const result: TextDecoration[] = [];
    let cursor = start,
      begin = 0,
      finish = this.comments.length;
    while (begin < finish) {
      const mid = (begin + finish) >>> 1;
      if (this.comments[mid].end <= start) begin = mid + 1;
      else finish = mid;
    }
    for (
      let i = begin;
      i < this.comments.length && this.comments[i].start < end;
      i++
    ) {
      const range = this.comments[i],
        left = Math.max(cursor, range.start),
        right = Math.min(end, range.end);
      if (left > cursor)
        result.push(...jsonLineDecorations(this.model.text, cursor, left));
      result.push({
        start: left,
        end: right,
        className: 'filumo-json-token-comment',
      });
      cursor = right;
    }
    if (cursor < end)
      result.push(...jsonLineDecorations(this.model.text, cursor, end));
    return result;
  }
  private enhanceComments() {
    if (
      this.syntax !== 'jsonc' ||
      this.comments ||
      this.commentPending ||
      !this.active ||
      this.closed
    )
      return;
    this.commenting.abort();
    const own = (this.commenting = new AbortController());
    this.commentPending = true;
    void import('./sourceComments')
      .then((m) => m.indexJsonComments(this.model.text, own.signal))
      .then((ranges) => {
        if (!this.closed && this.active && !own.signal.aborted) {
          this.comments = ranges;
          this.surface.update(
            this.model,
            this.options(this.currentOptions, this.currentZoom),
          );
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (this.commenting === own) {
          this.commentPending = false;
          if (own.signal.aborted && this.active && !this.closed)
            this.enhanceComments();
        }
      });
  }
  showSearch() {
    this.surface.showSearch(true);
  }
  getPosition() {
    return this.surface.getPosition();
  }
  restorePosition(position: TextSurfacePosition) {
    this.surface.restorePosition(position);
  }
  revealRange(range: { start: number; end: number }) {
    this.surface.revealRange?.(range);
  }
  setActive(active: boolean) {
    this.active = active;
    if (!active) this.commenting.abort();
    else this.enhanceComments();
    this.surface.setActive(active);
  }
  dispose() {
    this.closed = true;
    this.commenting.abort();
    this.comments = undefined;
    this.surface.dispose();
  }
}
