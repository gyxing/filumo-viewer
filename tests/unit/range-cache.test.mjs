import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const bundle = await build({
  entryPoints: ['packages/core/src/range/RangeCache.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { RangeCache } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

test('取消一个合并请求的等待者不影响其他等待者', async () => {
  const cache = new RangeCache(4),
    first = new AbortController(),
    second = new AbortController();
  let deliver,
    calls = 0,
    loadSignal;
  const load = (signal) => {
    calls++;
    loadSignal = signal;
    return new Promise((resolve) => {
      deliver = resolve;
    });
  };
  const a = cache.get(0, load, first.signal),
    b = cache.get(0, load, second.signal);
  await Promise.resolve();
  first.abort();
  await assert.rejects(a);
  assert.equal(loadSignal.aborted, false);
  deliver(Uint8Array.of(1, 2));
  assert.deepEqual(await b, Uint8Array.of(1, 2));
  assert.equal(calls, 1);
  cache.dispose();
});

test('闲置分块超预算后淘汰最早条目，销毁停止在途请求', async () => {
  const cache = new RangeCache(4),
    signal = new AbortController().signal;
  let calls = 0;
  const load = async () => {
    calls++;
    return Uint8Array.of(1, 2);
  };
  for (const key of [0, 1, 2, 0]) await cache.get(key, load, signal);
  assert.equal(calls, 4);
  const pending = cache.get(
    10,
    (current) =>
      new Promise((_resolve, reject) =>
        current.addEventListener('abort', () => reject(current.reason), {
          once: true,
        }),
      ),
    signal,
  );
  await Promise.resolve();
  cache.dispose();
  await assert.rejects(pending);
});
