import { SplitHandle } from '@fivo/dom/split';
import type { StylePolicy } from '@fivo/dom';
/** JSON 只适配公共分隔条的尺寸回调，模型及样式变量仍由工作区持有。 */
export class JsonSplitHandle {
  readonly element: HTMLElement;
  private handle: SplitHandle;
  constructor(
    panes: HTMLElement,
    source: HTMLElement,
    stylePolicy?: StylePolicy,
  ) {
    this.handle = new SplitHandle(panes, {
      first: source,
      minFirst: 280,
      minSecond: 240,
      stylePolicy,
      onResize: (_first, second) =>
        panes.style.setProperty('--fivo-json-tree-width', second + 'px'),
    });
    this.element = this.handle.element;
    this.element.classList.add('fivo-json-split-handle');
  }
  update(width: number, visible: boolean, en: boolean) {
    this.handle.update(width, visible, en ? 'en-US' : 'zh-CN');
  }
  dispose() {
    this.handle.dispose();
  }
}
