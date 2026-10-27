import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
const built = await build({
  stdin: {
    contents:
      "export {ArchiveWorkerClient} from './packages/archive/src/worker/ArchiveWorkerClient'; export {ArchiveBudget} from './packages/archive/src/reader/ArchiveBudget';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  alias: { '@filumo/core': resolve('packages/core/src/index.ts') },
});
const { ArchiveWorkerClient, ArchiveBudget } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(built.outputFiles[0].text).toString('base64')
);
test('缺少注入工厂时明确失败，不在客户端另行创建默认 Worker', async () => {
  const client = new ArchiveWorkerClient({}, new ArchiveBudget());
  const info = client.bridge.add({
    name: 'sample.zip',
    readAll: async () => new Uint8Array(),
    dispose: async () => {},
  });
  try {
    await assert.rejects(
      client.scan(info, 'zip', new AbortController().signal),
      /归档插件未提供 Worker 创建方式/,
    );
  } finally {
    await client.dispose();
  }
});
test('取消忙碌 Worker 会终止实例并保留根预算，下一次重建', async () => {
  let created = 0,
    terminated = 0;
  const factory = () => {
    created++;
    const callbacks = new Map();
    return {
      addEventListener: (name, fn) => callbacks.set(name, fn),
      removeEventListener: (name) => callbacks.delete(name),
      postMessage: (message) => {
        if (created > 1 && message.op)
          queueMicrotask(() =>
            callbacks.get('message')?.({
              data: { id: message.id, ok: true, entries: [] },
            }),
          );
      },
      terminate: () => {
        terminated++;
      },
    };
  };
  const budget = new ArchiveBudget(),
    client = new ArchiveWorkerClient({ workerFactory: factory }, budget),
    info = client.bridge.add({
      name: 'busy.rar',
      readAll: async () => new Uint8Array(),
      dispose: async () => {},
    }),
    abort = new AbortController();
  const pending = client.scan(info, 'rar', abort.signal);
  abort.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(terminated, 1);
  assert.ok(budget.used > 0);
  const used = budget.used;
  assert.deepEqual(
    await client.scan(info, 'rar', new AbortController().signal),
    [],
  );
  assert.equal(created, 2);
  assert.equal(budget.used, used);
  await client.dispose();
});
test('返回上级释放空闲引擎及嵌套来源，预算保持不变', async () => {
  let terminated = 0;
  const client = new ArchiveWorkerClient(
    {
      workerFactory: () => {
        const callbacks = new Map();
        return {
          addEventListener: (name, fn) => callbacks.set(name, fn),
          removeEventListener: (name) => callbacks.delete(name),
          postMessage: (message) =>
            queueMicrotask(() =>
              callbacks.get('message')?.({
                data: { id: message.id, ok: true, entries: [] },
              }),
            ),
          terminate: () => terminated++,
        };
      },
    },
    new ArchiveBudget(),
  );
  const info = client.bridge.add({
    name: 'nested.7z',
    readAll: async () => new Uint8Array(),
    dispose: async () => {},
  });
  await client.scan(info, '7z', new AbortController().signal);
  client.budget.consume(8);
  await client.reset();
  client.bridge.remove(info.id);
  assert.equal(terminated, 1);
  assert.equal(client.budget.used, 8);
  const reply = await client.bridge.reply(
    { sourceCall: 1, sourceId: info.id, method: 'range-info' },
    new AbortController().signal,
  );
  assert.equal(reply.ok, false);
  await client.dispose();
});
test('迟到的来源流在取消后立即释放，不能重新登记到桥接器', async () => {
  const client = new ArchiveWorkerClient({}, new ArchiveBudget());
  let release,
    cancelled = 0;
  const pendingStream = new Promise((resolve) => {
      release = resolve;
    }),
    signal = new AbortController();
  const info = client.bridge.add({ openStream: async () => pendingStream });
  const pending = client.bridge.reply(
    { sourceCall: 1, sourceId: info.id, method: 'stream-open' },
    signal.signal,
  );
  signal.abort();
  await client.bridge.cancelStreams();
  release(
    new ReadableStream({
      cancel() {
        cancelled++;
      },
    }),
  );
  assert.equal((await pending).ok, false);
  assert.equal(cancelled, 1);
  await client.dispose();
});
test('Worker 的资源限制错误码保留到主线程', async () => {
  const client = new ArchiveWorkerClient(
    {
      workerFactory: () => {
        const callbacks = new Map();
        return {
          addEventListener: (name, fn) => callbacks.set(name, fn),
          removeEventListener: (name) => callbacks.delete(name),
          postMessage: (message) =>
            queueMicrotask(() =>
              callbacks.get('message')?.({
                data: {
                  id: message.id,
                  ok: false,
                  code: 'FILE_SIZE_LIMIT_EXCEEDED',
                  message: '文件超过完整读取上限',
                },
              }),
            ),
          terminate() {},
        };
      },
    },
    new ArchiveBudget(),
  );
  const info = client.bridge.add({ name: 'large.rar' });
  try {
    await assert.rejects(
      client.scan(info, 'rar', new AbortController().signal),
      (error) => error.code === 'FILE_SIZE_LIMIT_EXCEEDED',
    );
  } finally {
    await client.dispose();
  }
});
