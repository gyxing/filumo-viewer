import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const out = await build({
  entryPoints: ['packages/archive/src/view/EntryPreview.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { EntryPreview } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(out.outputFiles[0].text).toString('base64')
);
test('迟到销毁不能清空后来打开的子预览，过期选择不创建查看器', async () => {
  const elements = [];
  const document = {
    defaultView: { URL: { createObjectURL: () => '', revokeObjectURL() {} } },
    createElement: () => ({
      remove() {
        const i = elements.indexOf(this);
        if (i >= 0) elements.splice(i, 1);
      },
    }),
  };
  const host = {
    ownerDocument: document,
    append(node) {
      elements.push(node);
    },
    replaceChildren() {
      elements.length = 0;
    },
  };
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const opened = [],
    viewers = [],
    configurations = [];
  const context = {
    createChildViewer: (mount, configuration) => {
      configurations.push(configuration);
      const index = viewers.length;
      const viewer = {
        open: async (file) => {
          opened.push(file.name);
        },
        destroy: async () => {
          if (index === 0) await gate;
        },
        setActive() {},
      };
      viewers.push(viewer);
      return viewer;
    },
  };
  const session = {
      current: { entries: [] },
      bytes: async () => new Uint8Array([65]),
    },
    preview = new EntryPreview(context, session, host),
    signal = new AbortController().signal;
  await preview.open(
    { id: '1', path: 'first.txt', kind: 'file', size: 1 },
    signal,
  );
  const old = preview.open(
    { id: '2', path: 'stale.txt', kind: 'file', size: 1 },
    signal,
  );
  await preview.open(
    { id: '3', path: 'latest.txt', kind: 'file', size: 1 },
    signal,
  );
  release();
  await old;
  assert.deepEqual(opened, ['first.txt', 'latest.txt']);
  assert.equal(elements.length, 1);
  assert.ok(
    configurations.every((configuration) => configuration.toolbar === false),
  );
  await preview.dispose();
});
