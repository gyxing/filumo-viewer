import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const result = await build({
  stdin: {
    contents:
      'export * from "./packages/core/src/index.ts"; export {useStyles} from "./packages/dom/src/styles.ts";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
});
const { createDocumentController, createSession, normalizeSource, useStyles } =
  await import(
    'data:text/javascript;base64,' +
      Buffer.from(result.outputFiles[0].text).toString('base64')
  );
function plugin(id, detect, opened) {
  return {
    id,
    protocolVersion: 1,
    extensions: ['.' + id],
    mimeTypes: [],
    detect,
    load: async () => ({
      open: async (source, ctx) => {
        opened.push(id);
        return createSession({ ...ctx, source, format: id, data: {} });
      },
    }),
  };
}
test('无元数据输入经过描述符探测，仅加载命中驱动，并可显式选择插件', async () => {
  const opened = [];
  let probes = 0;
  const controller = createDocumentController({
    plugins: [
      plugin(
        'a',
        async () => {
          probes++;
          return false;
        },
        opened,
      ),
      plugin(
        'b',
        async () => {
          probes++;
          return true;
        },
        opened,
      ),
    ],
  });
  await controller.open(new Uint8Array([1]));
  assert.deepEqual(opened, ['b']);
  assert.equal(probes, 2);
  await controller.open(new Uint8Array([1]), { pluginId: 'a' });
  assert.deepEqual(opened, ['b', 'a']);
  await assert.rejects(
    controller.open(new Uint8Array([1]), { pluginId: 'absent' }),
    { code: 'UNKNOWN_PLUGIN' },
  );
  await controller.destroy();
});
test('自定义来源统一限额，共享底层仅在最后租约释放后清理', async () => {
  let releases = 0;
  const raw = {
    readAll: async () => new Uint8Array(20),
    dispose: async () => {
      releases++;
    },
  };
  const a = await normalizeSource(() => raw, {
    resourcePolicy: { maxFileBytes: 1 },
  });
  const b = await normalizeSource(() => raw);
  await assert.rejects(a.readAll(new AbortController().signal), {
    code: 'FILE_SIZE_LIMIT_EXCEEDED',
  });
  await a.dispose();
  assert.equal(releases, 0);
  assert.equal((await b.readAll(new AbortController().signal)).length, 20);
  await b.dispose();
  await b.dispose();
  assert.equal(releases, 1);
});
test('自定义来源忽略取消时，包装层仍及时结束等待且不交付迟到结果', async () => {
  let finish;
  const source = await normalizeSource(() => ({
    readAll: () =>
      new Promise((r) => {
        finish = r;
      }),
    dispose: async () => {},
  }));
  const abort = new AbortController();
  const reading = source.readAll(abort.signal);
  await Promise.resolve();
  abort.abort();
  await assert.rejects(reading, { name: 'AbortError' });
  finish(new Uint8Array([1]));
  await source.dispose();
});
const domVersion = JSON.parse(
  await readFile('packages/dom/package.json', 'utf8'),
).version;
test('external 样式必须存在同版本就绪标记', () => {
  assert.throws(() => useStyles('dom', {}, { mode: 'external' }), /样式/);
  const document = {
    documentElement: {},
    defaultView: {
      getComputedStyle: () => ({ getPropertyValue: () => domVersion }),
    },
  };
  assert.doesNotThrow(() => useStyles('dom', document, { mode: 'external' })());
});

test('超时及时结束忽略取消的驱动，并释放迟到会话', async () => {
  let finish;
  let released = 0;
  const driver = {
    id: 'late',
    protocolVersion: 1,
    extensions: ['.late'],
    mimeTypes: [],
    detect: async () => true,
    load: async () => ({
      open: (source, ctx) =>
        new Promise((resolve) => {
          finish = () =>
            resolve(
              createSession({
                ...ctx,
                source,
                format: 'late',
                data: {},
                dispose: async () => {
                  released++;
                },
              }),
            );
        }),
    }),
  };
  const controller = createDocumentController({
    plugins: [driver],
    resourcePolicy: { timeoutMs: 20 },
  });
  await assert.rejects(controller.open(new File(['x'], 'x.late')), {
    code: 'LOAD_TIMEOUT',
  });
  assert.equal(controller.getSnapshot().status, 'error');
  assert.equal(controller.getSnapshot().error.code, 'LOAD_TIMEOUT');
  finish();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(released, 1);
  await controller.destroy();
});
