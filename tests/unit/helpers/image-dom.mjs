import { createDocument } from './reading-dom.mjs';

/** 只模拟图片加载与焦点；真实解码、布局和颜色由浏览器用例检查。 */
export function createImageDocument() {
  const document = createDocument(),
    frames = new Map();
  let sequence = 0;
  document.defaultView = {
    requestAnimationFrame(run) {
      frames.set(++sequence, run);
      return sequence;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
  };
  const create = document.createElement;
  document.createElement = (tag) => {
    const element = create();
    element.tagName = tag.toUpperCase();
    element.isConnected = true;
    element.clientWidth = 600;
    element.clientHeight = 400;
    element.removeAttribute = (name) => element.attributes.delete(name);
    element.querySelectorAll = (selector) => {
      const found = [];
      const visit = (node) => {
        for (const child of node.children ?? []) {
          if (selector === 'button' && child.tagName === 'BUTTON')
            found.push(child);
          visit(child);
        }
      };
      visit(element);
      return found;
    };
    if (tag === 'img')
      Object.defineProperty(element, 'src', {
        set(value) {
          element.attributes.set('src', value);
          queueMicrotask(() => {
            element.naturalWidth = 100;
            element.naturalHeight = 50;
            element.onload?.();
          });
        },
      });
    return element;
  };
  document.createElementNS = (_namespace, tag) => document.createElement(tag);
  return {
    document,
    host: document.createElement('div'),
    flush() {
      const scheduled = [...frames.values()];
      frames.clear();
      for (const run of scheduled) run();
    },
  };
}
