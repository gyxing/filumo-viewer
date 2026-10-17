// 单元层只模拟节点和焦点，布局、弹层与主题由浏览器用例覆盖。
export function createDocument() {
  const document = { activeElement: undefined };
  class Element {
    children = [];
    attributes = new Map();
    dataset = {};
    style = {};
    scrollTop = 0;
    scrollLeft = 0;
    clientHeight = 400;
    ownerDocument = document;
    listeners = new Map();
    addEventListener(type, callback) {
      this.listeners.set(type, callback);
    }
    removeEventListener(type) {
      this.listeners.delete(type);
    }
    append(...nodes) {
      for (const node of nodes) {
        node.parentElement = this;
        this.children.push(node);
      }
    }
    prepend(...nodes) {
      this.children.unshift(...nodes);
      for (const node of nodes) node.parentElement = this;
    }
    replaceChildren(...nodes) {
      this.children = [];
      this.append(...nodes);
    }
    setAttribute(name, value) {
      this.attributes.set(name, value);
    }
    getAttribute(name) {
      return this.attributes.get(name);
    }
    contains(node) {
      return (
        this === node || this.children.some((child) => child.contains?.(node))
      );
    }
    focus() {
      document.activeElement = this;
    }
    remove() {
      if (this.parentElement)
        this.parentElement.children = this.parentElement.children.filter(
          (child) => child !== this,
        );
    }
    querySelector(selector) {
      const match = selector.match(/^\[data-node-id="(\d+)"\]$/);
      const find = (node) => {
        for (const child of node.children) {
          if (
            match
              ? child.dataset.nodeId === match[1]
              : child.className?.split(' ').includes(selector.slice(1))
          )
            return child;
          const nested = child.children && find(child);
          if (nested) return nested;
        }
      };
      return find(this);
    }
  }
  document.createElement = () => new Element();
  document.createElementNS = () => new Element();
  document.createTextNode = (textContent) => ({ textContent });
  return document;
}
