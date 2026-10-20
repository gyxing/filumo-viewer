import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const result = await build({
  entryPoints: ['packages/core/src/text.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readText, serveTextTasks } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')
);

test('公共读取的格式提示低于 BOM 和来源声明，手动编码最高', async () => {
  const bytes = Uint8Array.of(0xef, 0xbb, 0xbf, 65),
    signal = new AbortController().signal;
  assert.equal(
    (await readText(bytes, { signal, encodingHint: 'gb18030' })).document
      .encoding,
    'utf-8',
  );
  const plain = new TextEncoder().encode('abc');
  assert.equal(
    (
      await readText(plain, {
        signal,
        mimeType: 'text/plain;charset=utf-8',
        encodingHint: 'gb18030',
      })
    ).document.encoding,
    'utf-8',
  );
  assert.equal(
    (await readText(plain, { signal, encodingHint: 'gb18030' })).document
      .encoding,
    'gb18030',
  );
});

test('新版任务分发取消指定任务，不影响另一个并行请求', async () => {
  const replies = [],
    signals = new Map(),
    release = new Map();
  const scope = {
    onmessage: null,
    postMessage: (message) => replies.push(message),
  };
  serveTextTasks(scope, {
    work: (payload, signal) => {
      signals.set(payload, signal);
      return new Promise((resolve) => release.set(payload, resolve));
    },
  });
  scope.onmessage({ data: { id: 1, task: 'work', payload: 'a' } });
  scope.onmessage({ data: { id: 2, task: 'work', payload: 'b' } });
  await Promise.resolve();
  scope.onmessage({ data: { id: 1, task: 'work', cancel: true } });
  assert.equal(signals.get('a').aborted, true);
  assert.equal(signals.get('b').aborted, false);
  release.get('a')('old');
  release.get('b')('new');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(
    replies.map((value) => value.id),
    [2],
  );
});
