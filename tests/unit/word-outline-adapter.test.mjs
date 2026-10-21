import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { createDocument } from './helpers/reading-dom.mjs';
const result = await build({
  entryPoints: ['packages/office/src/renderers/word/WordOutline.ts'],
  alias: { '@filumo/dom/outline': resolve('packages/dom/src/outline.ts') },
  loader: { '.less': 'empty' },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { WordOutline } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')
);
const node = (id, children) => ({
  id,
  key: id,
  text: id,
  level: 0,
  targetBlockId: id,
  isLeaf: children?.length === 0,
  children,
});
const tick = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

function fixture() {
  const document = createDocument(),
    create = document.createElement;
  document.createElement = (...args) => {
    const element = create(...args);
    element.classList = {
      add(name) {
        element.className = [
          ...new Set((element.className ?? '').split(' ').concat(name)),
        ]
          .filter(Boolean)
          .join(' ');
      },
    };
    return element;
  };
  let deliver,
    reject,
    revision = 1,
    listener;
  const root = node('a', [node('b')]),
    calls = [],
    errors = [];
  const provider = {
    getSnapshot: () => ({ revision, count: 3, complete: false }),
    subscribe(fn) {
      listener = fn;
      return () => {
        listener = undefined;
      };
    },
    getRoots: () => [root],
    getChildren: () =>
      new Promise((resolve, fail) => {
        deliver = resolve;
        reject = fail;
      }),
    getAncestors: async () => [],
    locate() {},
  };
  const base = {
    document,
    onError: (error) => errors.push(error),
    services: {
      state: { execute: async () => {} },
      layout: {
        schedule(_key, read, write) {
          write(read());
          return () => {};
        },
      },
    },
  };
  const outline = new WordOutline(provider, base, async (id) => {
    calls.push(id);
    return true;
  });
  const row = (id) =>
    outline.element.querySelector('[data-outline-id="' + id + '"]');
  const key = (id, value) =>
    row(id).onkeydown({
      key: value,
      preventDefault() {},
      stopPropagation() {},
    });
  return {
    outline,
    calls,
    errors,
    row,
    key,
    capture: () => deliver,
    resolve: (children) => deliver(children),
    reject: (error) => reject(error),
    revise() {
      revision++;
      listener?.();
    },
  };
}

test('Word 子级折叠后迟到只缓存，重新展开复用，不执行正文定位', async () => {
  const f = fixture();
  try {
    f.key('b', 'ArrowRight');
    f.key('b', 'ArrowLeft');
    f.resolve([node('late', [])]);
    await tick();
    assert.equal(f.row('late'), undefined);
    assert.equal(f.row('b').getAttribute('aria-expanded'), 'false');
    f.key('b', 'ArrowRight');
    assert.ok(f.row('late'));
    assert.deepEqual(f.calls, []);
  } finally {
    f.outline.dispose();
  }
});
test('Word 修订或销毁后旧请求不能写入，加载失败报告并恢复收起', async () => {
  for (const mode of ['revision', 'dispose', 'failure']) {
    const f = fixture();
    f.key('b', 'ArrowRight');
    const finishOldRequest = f.capture();
    if (mode === 'revision') f.revise();
    if (mode === 'dispose') f.outline.dispose();
    if (mode === 'failure') f.reject(new Error('读取子级失败'));
    else finishOldRequest([node('stale', [])]);
    await tick();
    assert.equal(f.row('stale'), undefined);
    assert.deepEqual(f.calls, []);
    if (mode === 'failure') {
      assert.equal(f.errors.length, 1);
      assert.equal(f.row('b').getAttribute('aria-expanded'), 'false');
    }
    f.outline.dispose();
  }
});
