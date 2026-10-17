import type { StylePolicy, ViewOptions } from '@fivo/dom';
import type { TextDocument } from '@fivo/text/reader';
import type { TextSurfaceHandle, TextSurfacePosition } from '@fivo/text/view';
import { mountTextSurface } from '@fivo/text/view';
import { jsonLineDecorations } from './jsonTokens';
import './source.less';

/** JSON 代码区只提供原生行着色，结构扫描和树均不在此入口加载。 */
export class JsonSource {
  private surface: TextSurfaceHandle;
  constructor(
    container: HTMLElement,
    private model: TextDocument,
    options: ViewOptions,
    zoom: number,
    private policy?: StylePolicy,
  ) {
    this.surface = mountTextSurface(
      container,
      model,
      this.options(options, zoom),
    );
  }
  private options(options: ViewOptions, zoom: number) {
    return {
      ...options,
      zoom,
      lineNumbers: false,
      watermark: undefined,
      stylePolicy: this.policy,
      decorateLine: (start: number, end: number) =>
        jsonLineDecorations(this.model.text, start, end),
    };
  }
  /** 字号和语言更新不改变原始文件或解析结果。 */
  update(options: ViewOptions, zoom: number) {
    this.surface.update(this.model, this.options(options, zoom));
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
    this.surface.setActive(active);
  }
  dispose() {
    this.surface.dispose();
  }
}
