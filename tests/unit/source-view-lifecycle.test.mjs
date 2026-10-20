import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

const bundle = await build({
  stdin: {
    contents: `export {normalizeSource} from './packages/core/src/source';
      export {waitForView} from './packages/dom/src/waitForView';
      export {readOfficeFile} from './packages/office/src/runtime/readOfficeFile';`,
    resolveDir: resolve('.'),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  alias: {
    '@fivo/core': resolve('packages/core/src/index.ts'),
  },
});
const { normalizeSource, waitForView, readOfficeFile } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
const signal = () => new AbortController().signal;

test('前缀窗口超过文件和配额时按实际长度读取，不误报文件超限', async () => {
  for (const size of [1024, undefined]) {
    const calls = [];
    const source = await normalizeSource(
      () => ({
        size,
        readRange: async (offset, length) => {
          calls.push([offset, length]);
          return new Uint8Array(Math.min(length, 1024));
        },
        readAll: async () => new Uint8Array(1024),
        dispose: async () => {},
      }),
      { resourcePolicy: { maxFileBytes: 2048 } },
    );
    try {
      assert.equal((await source.readRange(0, 65536, signal())).length, 1024);
      assert.deepEqual(calls, [[0, size ?? 2048]]);
    } finally {
      await source.dispose();
    }
  }
});

test('没有区间能力的来源共享全文缓存，同时检查实际大小和区间整数', async () => {
  let reads = 0;
  const source = await normalizeSource(
    () => ({
      readAll: async () => {
        reads++;
        return new Uint8Array(1024);
      },
      dispose: async () => {},
    }),
    { resourcePolicy: { maxFileBytes: 2048 } },
  );
  try {
    assert.equal((await source.readRange(0, 65536, signal())).length, 1024);
    assert.equal((await source.readRange(1020, 65536, signal())).length, 4);
    assert.equal(reads, 1);
    for (const [offset, length] of [
      [-1, 1],
      [0, NaN],
      [Number.MAX_SAFE_INTEGER, 1],
    ])
      await assert.rejects(source.readRange(offset, length, signal()), {
        code: 'INVALID_RANGE',
      });
  } finally {
    await source.dispose();
  }
  const large = await normalizeSource(
    () => ({
      readAll: async () => new Uint8Array(2049),
      dispose: async () => {},
    }),
    { resourcePolicy: { maxFileBytes: 2048 } },
  );
  try {
    await assert.rejects(large.readAll(signal()), {
      code: 'FILE_SIZE_LIMIT_EXCEEDED',
    });
  } finally {
    await large.dispose();
  }
});

test('本地文件复用原 Blob，前缀读取和 Office 适配都不调用全文 arrayBuffer', async () => {
  const file = new File(['local content'], 'sample.docx');
  file.arrayBuffer = async () => {
    throw new Error('不应读取本地文件全文');
  };
  const source = await normalizeSource(file);
  try {
    assert.equal(await source.readBlob(signal()), file);
    assert.equal(
      new TextDecoder().decode(await source.readRange(0, 5, signal())),
      'local',
    );
    assert.equal(await readOfficeFile(source, signal()), file);
  } finally {
    await source.dispose();
  }
  await assert.rejects(source.readBlob(signal()), { code: 'SOURCE_DISPOSED' });
});

test('缺少 Blob 能力时 Office 回退字节读取，保留文件名和内容', async () => {
  let reads = 0;
  const bytes = new TextEncoder().encode('original');
  const file = await readOfficeFile(
    {
      name: 'sample.pptx',
      readAll: async () => {
        reads++;
        return bytes;
      },
      dispose: async () => {},
    },
    signal(),
  );
  assert.equal(reads, 1);
  assert.equal(file.name, 'sample.pptx');
  assert.equal(await file.text(), 'original');
});

test('自定义 Blob 来源仍受实际配额、取消和释放状态约束', async () => {
  const large = await normalizeSource(
    () => ({
      readBlob: async () => new Blob(['12345']),
      readAll: async () => new Uint8Array(5),
      dispose: async () => {},
    }),
    { resourcePolicy: { maxFileBytes: 4 } },
  );
  try {
    await assert.rejects(large.readBlob(signal()), {
      code: 'FILE_SIZE_LIMIT_EXCEEDED',
    });
  } finally {
    await large.dispose();
  }
  let finish;
  const source = await normalizeSource(() => ({
    readBlob: () =>
      new Promise((resolveBlob) => {
        finish = resolveBlob;
      }),
    readAll: async () => new Uint8Array(),
    dispose: async () => {},
  }));
  const abort = new AbortController();
  const reading = source.readBlob(abort.signal);
  await Promise.resolve();
  abort.abort();
  await assert.rejects(reading, { name: 'AbortError' });
  finish(new Blob(['late']));
  await source.dispose();
  await assert.rejects(source.readBlob(signal()), { code: 'SOURCE_DISPOSED' });
});

test('远程 Blob 能力不触发请求，多次前缀读取复用一次下载', async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return new Response('remote text');
  };
  let source;
  try {
    source = await normalizeSource('https://example.test/sample.txt');
    assert.equal(await source.readBlob(signal()), undefined);
    assert.equal(requests, 0);
    assert.equal((await source.readRange(0, 3, signal())).length, 3);
    await source.readRange(3, 4, signal());
    await source.readAll(signal());
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = original;
    await source?.dispose();
  }
});

test(
  '视图加载不返回时取消立即结束等待，尚未开始的任务不调用插件',
  { timeout: 2000 },
  async () => {
    const abort = new AbortController();
    const opening = waitForView(() => new Promise(() => {}), abort.signal);
    await Promise.resolve();
    abort.abort();
    await assert.rejects(opening, { name: 'AbortError' });
    let calls = 0;
    await assert.rejects(
      waitForView(() => {
        calls++;
      }, abort.signal),
      { name: 'AbortError' },
    );
    assert.equal(calls, 0);
  },
);

test(
  '挂载取消后迟到句柄仅释放一次，正常交付的句柄不由等待器重复释放',
  { timeout: 2000 },
  async () => {
    let finish,
      released = 0,
      didRelease;
    const releaseDone = new Promise((resolveRelease) => {
      didRelease = resolveRelease;
    });
    const abort = new AbortController();
    const opening = waitForView(
      () =>
        new Promise((resolveView) => {
          finish = resolveView;
        }),
      abort.signal,
      async (handle) => {
        released++;
        await handle.dispose();
        didRelease();
      },
    );
    await Promise.resolve();
    abort.abort();
    await assert.rejects(opening, { name: 'AbortError' });
    finish({ dispose: async () => {} });
    await releaseDone;
    abort.abort();
    assert.equal(released, 1);
    const nextAbort = new AbortController();
    const handle = {};
    assert.equal(
      await waitForView(
        () => handle,
        nextAbort.signal,
        () => {
          released++;
        },
      ),
      handle,
    );
    nextAbort.abort();
    assert.equal(released, 1);
  },
);
