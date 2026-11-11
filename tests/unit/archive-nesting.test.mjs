import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
const out = await build({
  entryPoints: ['packages/archive/src/runtime/ArchiveSession.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  alias: { '@filumo/core': resolve('packages/core/src/index.ts') },
});
const { ArchiveSession } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(out.outputFiles[0].text).toString('base64')
);
test('嵌套会话共享根预算，元数据不会在取消重建时刷新', async () => {
  const session = new ArchiveSession({
    resourcePolicy: { maxTotalUncompressedBytes: 10, maxNestedDepth: 1 },
  });
  session.budget.consume(4);
  assert.equal(session.budget.used, 4);
  session.budget.depth(1);
  assert.throws(() => session.budget.depth(2));
  session.cache.set('entry', new Uint8Array(3));
  assert.equal(session.cache.get('entry').length, 3);
  await session.dispose();
  assert.equal(session.cache.get('entry'), undefined);
});
test('显式指定 Archive 也不能启动单文件 XZ 引擎', async () => {
  const session = new ArchiveSession({
    workerFactory: () => assert.fail('不应创建 XZ Worker'),
  });
  try {
    await assert.rejects(
      session.open(
        {
          name: 'sample.txt.xz',
          getRangeReader: async () => assert.fail('不应读取 XZ 正文'),
        },
        new AbortController().signal,
      ),
      /暂不支持单文件 XZ/,
    );
    assert.equal(session.levels.length, 0);
    assert.equal(session.budget.used, 0);
  } finally {
    await session.dispose();
  }
});

test('无区间的匿名归档打开复用前缀识别，不依赖全文缓存副作用', async () => {
  const session = new ArchiveSession({});
  session.worker.scan = async (_info, format) => {
    assert.equal(format, 'zip');
    return [];
  };
  try {
    await session.open(
      {
        name: 'download',
        getRangeReader: async () => undefined,
        readRange: async () => new Uint8Array([0x50, 0x4b, 3, 4]),
        readAll: () => assert.fail('首部识别不能全文读取'),
      },
      new AbortController().signal,
    );
    assert.equal(session.current.format, 'zip');
  } finally {
    await session.dispose();
  }
});
