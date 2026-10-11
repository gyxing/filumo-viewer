import { DisposalScope } from '../../services/lifetime/DisposalScope';
/** 将事件、子视图和资源租约绑定到一个真实 DOM 节点，无虚拟 DOM 协议。 */
export class ElementScope extends DisposalScope {
  constructor(readonly element: HTMLElement) {
    super();
    this.add(() => element.remove());
  }
  listen<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ) {
    this.element.addEventListener(type, listener as EventListener, options);
    this.add(() =>
      this.element.removeEventListener(
        type,
        listener as EventListener,
        options,
      ),
    );
  }
}
