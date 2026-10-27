import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const result = await build({
  entryPoints: ['packages/core/src/index.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { normalizeSource, readSourceBytes } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')
);
const signal = () => new AbortController().signal;

test('来源流不调用 readAll，超限取消上游且可重放', async () => {
  let cancelled = 0,
    reads = 0;
  const source = await normalizeSource(
    () => ({
      readAll: async () => {
        reads++;
        throw Error('不应完整读取');
      },
      openStream: async () =>
        new ReadableStream({
          pull(c) {
            c.enqueue(new Uint8Array(3));
          },
          cancel() {
            cancelled++;
          },
        }),
      dispose: async () => {},
    }),
    { resourcePolicy: { maxFileBytes: 4 } },
  );
  try {
    await assert.rejects(readSourceBytes(source, 4, signal()));
    assert.equal(reads, 0);
    assert.ok(cancelled > 0);
  } finally {
    await source.dispose();
  }
});
test('Blob 流可以重放，未知长度且无流的来源拒绝有界物化', async () => {
  const source = await normalizeSource(new Blob(['hello']));
  try {
    assert.equal(
      new TextDecoder().decode(await readSourceBytes(source, 5, signal())),
      'hello',
    );
    assert.equal(
      new TextDecoder().decode(await readSourceBytes(source, 5, signal())),
      'hello',
    );
  } finally {
    await source.dispose();
  }
  let called = false;
  const custom = await normalizeSource(() => ({
    readAll: async () => {
      called = true;
      return new Uint8Array();
    },
    dispose: async () => {},
  }));
  await assert.rejects(readSourceBytes(custom, 5, signal()));
  assert.equal(called, false);
  await custom.dispose();
});
test('来源销毁取消已经交付的流，不等待下一次发起读取', async () => {
  let cancelled = 0;
  const source = await normalizeSource(() => ({
    readAll: async () => new Uint8Array(),
    openStream: async () =>
      new ReadableStream({
        pull(c) {
          c.enqueue(new Uint8Array([1]));
        },
        cancel() {
          cancelled++;
        },
      }),
    dispose: async () => {},
  }));
  const reader = (await source.openStream(signal())).getReader();
  await reader.read();
  await source.dispose();
  await assert.rejects(reader.read(), { name: 'AbortError' });
  assert.equal(cancelled, 1);
  reader.releaseLock();
});
test('有界读取拒绝自定义来源的短区间，不能补零后当作完整文件', async () => {
  const source = {
    getRangeReader: async () => ({
      length: 10,
      read: async () => new Uint8Array(2),
    }),
  };
  await assert.rejects(
    readSourceBytes(source, 10, signal()),
    (error) => error.code === 'INVALID_RANGE',
  );
});
