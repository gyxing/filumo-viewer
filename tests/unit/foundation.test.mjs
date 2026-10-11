import { build } from 'esbuild';
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
  createDocumentController,
  createSession,
  normalizeSource,
} from '../../packages/core/dist/index.js';

/** 用真实会话验证加载与释放，不替代 Office 的实际解析器。 */
function fixturePlugin(open) {
  return {
    id: 'fixture',
    protocolVersion: 1,
    extensions: ['.fixture'],
    mimeTypes: [],
    detect: async () => true,
    load: async () => ({ open }),
  };
}

test('Core 不要求 Office 页模型，观察者异常也不打断会话', async () => {
  const controller = createDocumentController({
    plugins: [
      fixturePlugin(async (source, ctx) =>
        createSession({
          ...ctx,
          source,
          format: 'fixture',
          data: { content: 'hello' },
        }),
      ),
    ],
  });
  controller.subscribe(() => {
    throw new Error('observer failure');
  });
  await controller.open(new File(['hello'], 'a.fixture'));
  assert.equal(controller.getSnapshot().status, 'ready');
  assert.equal(controller.getSnapshot().session.data.content, 'hello');
  await controller.destroy();
  assert.equal(controller.getSnapshot().status, 'disposed');
});

test('旧加载迟到完成不能覆盖新文件，旧会话必须释放', async () => {
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  const disposed = [];
  let finishOldDisposal;
  const oldDisposed = new Promise((resolve) => {
    finishOldDisposal = resolve;
  });
  const controller = createDocumentController({
    plugins: [
      fixturePlugin(async (source, ctx) => {
        if (source.name === 'old.fixture') await blocked;
        return createSession({
          ...ctx,
          source,
          format: 'fixture',
          data: source.name,
          dispose: () => {
            disposed.push(source.name);
            if (source.name === 'old.fixture') finishOldDisposal();
          },
        });
      }),
    ],
  });
  const first = controller
    .open(new File(['old'], 'old.fixture'))
    .catch((error) => error);
  await new Promise((resolve) => setTimeout(resolve, 10));
  await controller.open(new File(['new'], 'new.fixture'));
  release();
  assert.equal((await first).name, 'AbortError');
  assert.equal(controller.getSnapshot().session.data, 'new.fixture');
  await oldDisposed;
  assert.ok(disposed.includes('old.fixture'));
  await controller.destroy();
  await controller.destroy();
  assert.equal(disposed.filter((name) => name === 'new.fixture').length, 1);
});

test('重复插件和协议不兼容在打开文件前明确失败', () => {
  const plugin = fixturePlugin(async () => {});
  assert.throws(() => createDocumentController({ plugins: [plugin, plugin] }));
  assert.throws(() =>
    createDocumentController({ plugins: [{ ...plugin, protocolVersion: 2 }] }),
  );
});

test('没有匹配插件时明确报错，不尝试加载所有实现', async () => {
  let loads = 0;
  const controller = createDocumentController({
    plugins: [
      {
        ...fixturePlugin(async () => {}),
        detect: async () => false,
        load: async () => {
          loads++;
          return {};
        },
      },
    ],
  });
  await assert.rejects(controller.open(new File(['x'], 'x.unknown')), {
    code: 'UNSUPPORTED_FORMAT',
  });
  assert.equal(loads, 0);
  await controller.destroy();
});

test('来源字节上限在读取时生效，释放后不可继续读取', async () => {
  const source = await normalizeSource(new File(['hello'], 'a.fixture'), {
    resourcePolicy: { maxFileBytes: 3 },
  });
  await assert.rejects(source.readAll(new AbortController().signal), {
    code: 'FILE_SIZE_LIMIT_EXCEEDED',
  });
  await source.dispose();
  await assert.rejects(source.readAll(new AbortController().signal));
});

test('清理失败仍会释放来源，并且不会重复调用清理函数', async () => {
  let released = 0;
  const source = {
    name: 'x',
    readAll: async () => new Uint8Array(),
    dispose: async () => {
      released++;
    },
  };
  const session = createSession({
    id: 'x',
    signal: new AbortController().signal,
    source,
    format: 'fixture',
    data: null,
    dispose: () => {
      throw new Error('cleanup');
    },
  });
  await assert.rejects(session.dispose());
  await assert.rejects(session.dispose());
  assert.equal(released, 1);
});

test('清理观察者重入不会重复释放同一会话', async () => {
  let releases = 0;
  const source = {
    readAll: async () => new Uint8Array(),
    dispose: async () => {
      releases++;
    },
  };
  const session = createSession({
    id: 'reentrant',
    signal: new AbortController().signal,
    source,
    format: 'fixture',
    data: null,
  });
  session.subscribe(() => {
    if (session.getSnapshot().status === 'cancelled') void session.dispose();
  });
  await session.dispose();
  assert.equal(releases, 1);
});

test('Office Worker 崩溃后新请求立即拒绝，不永久等待', async () => {
  const result = await build({
    stdin: {
      contents:
        'export {WorkerSourceClient} from "./packages/office/src/engine/parsing/runtime/source/WorkerSourceClient.ts"; export {OFFICE_PARSER_PROTOCOL_VERSION} from "./packages/office/src/engine/parsing/protocol/version.ts";',
      resolveDir: path.resolve('.'),
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });
  const { WorkerSourceClient, OFFICE_PARSER_PROTOCOL_VERSION: version } =
    await import(
      'data:text/javascript;base64,' +
        Buffer.from(result.outputFiles[0].text).toString('base64')
    );
  const listeners = new Map();
  const worker = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
      if (type === 'message')
        setTimeout(
          () => listener({ data: { type: 'worker-ready', version } }),
          0,
        );
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    postMessage(message) {
      if (message.type === 'source-request')
        queueMicrotask(() =>
          listeners.get('message')?.({
            data: { ...message, type: 'source-response', result: 'ok' },
          }),
        );
    },
    terminate() {},
  };
  const client = new WorkerSourceClient('fixture', () => worker, 100);
  try {
    assert.equal(await client.request('get-range'), 'ok');
    listeners.get('error')();
    const outcome = await Promise.race([
      client.request('get-range').then(
        () => 'resolved',
        (error) => error.code,
      ),
      new Promise((resolve) => setTimeout(() => resolve('hung'), 30)),
    ]);
    assert.equal(outcome, 'WORKER_RUNTIME_CRASH');
  } finally {
    await client.dispose();
  }
});
