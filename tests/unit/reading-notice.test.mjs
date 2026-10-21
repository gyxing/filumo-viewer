import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument } from './helpers/reading-dom.mjs';

const bundle = await build({
  entryPoints: ['packages/dom/src/shell/ReadingNotice.ts'],
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const { createReadingNotice } = await import('data:text/javascript;base64,' +
  Buffer.from(bundle.outputFiles[0].text).toString('base64'));

test('阅读浮窗去重、自动关闭、悬停暂停、停用暂停及销毁清理', () => {
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout,
    originalNow = Date.now;
  const timers = new Map();
  let time = 0, sequence = 0;
  globalThis.setTimeout = (run, delay) => {
    const id = ++sequence;
    timers.set(id, { run, due: time + delay });
    return id;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);
  Date.now = () => time;
  const tick = (duration) => {
    time += duration;
    for (const [id, task] of [...timers])
      if (task.due <= time) { timers.delete(id); task.run(); }
  };
  let notice;
  try {
    const document = createDocument(), create = document.createElement;
    const element = () => {
      const node = create();
      node.classList = {
        add: (name) => { node.className = [node.className, name].filter(Boolean).join(' '); },
        toggle: (name, enabled) => {
          const names = new Set((node.className ?? '').split(' ').filter(Boolean));
          if (enabled) names.add(name); else names.delete(name);
          node.className = [...names].join(' ');
        },
      };
      return node;
    };
    document.createElement = document.createElementNS = element;
    notice = createReadingNotice(document, () => {});
    notice.update(1, '第一次失败');
    assert.equal(notice.element.hidden, false);
    tick(6000);
    assert.equal(notice.element.hidden, true);
    notice.update(1, '第一次失败');
    assert.equal(notice.element.hidden, true);
    notice.update(2, '第二次失败');
    tick(1000);
    notice.element.onpointerenter();
    tick(10000);
    assert.equal(notice.element.hidden, false);
    notice.element.onpointerleave();
    tick(4999);
    assert.equal(notice.element.hidden, false);
    tick(1);
    assert.equal(notice.element.hidden, true);
    notice.update(3, '第三次失败');
    notice.element.querySelector('.filumo-reading-notice-close').onclick();
    notice.update(3, '第三次失败');
    assert.equal(notice.element.hidden, true);
    notice.update(4, '第四次失败');
    notice.setActive(false);
    tick(7000);
    assert.equal(notice.element.hidden, false);
    notice.setActive(true);
    tick(6000);
    assert.equal(notice.element.hidden, true);
    notice.update(5, '第五次失败');
    assert.equal(timers.size, 1);
    notice.dispose();
    assert.equal(timers.size, 0);
  } finally {
    notice?.dispose();
    globalThis.setTimeout = originalSet;
    globalThis.clearTimeout = originalClear;
    Date.now = originalNow;
  }
});
