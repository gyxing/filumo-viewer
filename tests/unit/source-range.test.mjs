import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const bundle = await build({
  entryPoints: ['packages/core/src/source.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { normalizeSource } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
const signal = () => new AbortController().signal;

test('自定义高效 Reader 检查总长、短读、范围并共享来源所有权', async () => {
  let releases = 0;
  const raw = {
    readAll: async () => new Uint8Array(8),
    getRangeReader: async () => ({
      length: 8,
      read: async () => new Uint8Array(1),
    }),
    dispose: async () => {
      releases++;
    },
  };
  const first = await normalizeSource(() => raw),
    second = await normalizeSource(() => raw);
  try {
    const reader = await first.getRangeReader(signal());
    await assert.rejects(reader.read(0, 2, signal()), {
      code: 'INVALID_RANGE',
    });
    await assert.rejects(reader.read(-1, 2, signal()), {
      code: 'INVALID_RANGE',
    });
    await first.dispose();
    assert.equal(releases, 0);
  } finally {
    await first.dispose();
    await second.dispose();
  }
  assert.equal(releases, 1);
  const limited = await normalizeSource(() => raw, {
    resourcePolicy: { maxFileBytes: 4 },
  });
  try {
    await assert.rejects(limited.getRangeReader(signal()), {
      code: 'FILE_SIZE_LIMIT_EXCEEDED',
    });
  } finally {
    await limited.dispose();
  }
});

test('原请求信号取消后，本地缓存也不能继续交付', async () => {
  const original = globalThis.fetch,
    abort = new AbortController();
  globalThis.fetch = async () => new Response('fixture');
  let source;
  try {
    source = await normalizeSource({
      url: 'https://example.test/sample.pdf',
      request: { signal: abort.signal },
    });
    await source.readAll(signal());
    abort.abort();
    await assert.rejects(source.getRangeReader(signal()));
    await assert.rejects(source.readAll(signal()));
  } finally {
    await source?.dispose();
    globalThis.fetch = original;
  }
});

test('非 GET 请求不尝试 Range，完整读取保留请求方法与 body', async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (_url, options) => {
    requests++;
    assert.equal(options.method, 'POST');
    assert.equal(options.body, 'fixture');
    assert.equal(new Headers(options.headers).has('range'), false);
    return new Response('fixture');
  };
  let source;
  try {
    source = await normalizeSource({
      url: 'https://example.test/sample.pdf',
      request: { method: 'POST', body: 'fixture' },
    });
    assert.equal(await source.getRangeReader(signal()), undefined);
    await source.readAll(signal());
    assert.equal(requests, 1);
  } finally {
    await source?.dispose();
    globalThis.fetch = original;
  }
});

test('206 总长度超限和鉴权失败不能作为全文回退吞掉', async () => {
  const original = globalThis.fetch;
  try {
    for (const [status, code] of [
      [206, 'FILE_SIZE_LIMIT_EXCEEDED'],
      [403, 'DOWNLOAD_FAILED'],
    ]) {
      let source;
      globalThis.fetch = async () =>
        new Response(new Uint8Array(8), {
          status,
          headers: { 'Content-Range': 'bytes 0-7/8' },
        });
      try {
        source = await normalizeSource('https://example.test/sample.pdf', {
          resourcePolicy: { maxFileBytes: 4 },
        });
        await assert.rejects(source.getRangeReader(signal()), { code });
      } finally {
        await source?.dispose();
      }
    }
  } finally {
    globalThis.fetch = original;
  }
});

test('本地高效 Reader 不读取全文，释放后拒绝继续读取', async () => {
  const file = new File(['abcdefgh'], 'sample.pdf');
  file.arrayBuffer = async () => {
    throw Error('禁止全文读取');
  };
  const source = await normalizeSource(file),
    reader = await source.getRangeReader(signal());
  assert.equal(reader.length, 8);
  assert.equal(
    new TextDecoder().decode(await reader.read(2, 3, signal())),
    'cde',
  );
  await source.dispose();
  await assert.rejects(reader.read(0, 1, signal()));
});

test('Range 被忽略的 200 响应复用为一次完整读取并保留鉴权', async () => {
  const original = globalThis.fetch;
  let requests = 0,
    auth;
  globalThis.fetch = async (_url, options) => {
    requests++;
    auth = new Headers(options.headers).get('authorization');
    return new Response('original', {
      headers: { 'content-type': 'application/pdf' },
    });
  };
  let source;
  try {
    source = await normalizeSource({
      url: 'https://example.test/sample.pdf',
      request: { headers: { authorization: 'Bearer fixture' } },
    });
    assert.equal(await source.getRangeReader(signal()), undefined);
    assert.equal(
      new TextDecoder().decode(await source.readAll(signal())),
      'original',
    );
    assert.equal(requests, 1);
    assert.equal(auth, 'Bearer fixture');
  } finally {
    await source?.dispose();
    globalThis.fetch = original;
  }
});

test('真实分块合并和文件版本变更会拒绝不一致来源', async () => {
  const original = globalThis.fetch;
  const data = new Uint8Array(300000).fill(65);
  let requests = 0;
  globalThis.fetch = async (_url, options) => {
    requests++;
    const [, startText, endText] = new Headers(options.headers)
      .get('range')
      .match(/bytes=(\d+)-(\d+)/);
    const start = Number(startText),
      end = Math.min(Number(endText), data.length - 1);
    return new Response(data.slice(start, end + 1), {
      status: 206,
      headers: {
        'content-range': `bytes ${start}-${end}/${data.length}`,
        etag: requests === 1 ? 'v1' : 'v2',
      },
    });
  };
  let source;
  try {
    source = await normalizeSource('https://example.test/sample.pdf');
    const reader = await source.getRangeReader(signal());
    assert.equal((await reader.read(0, 8, signal())).length, 8);
    await assert.rejects(reader.read(270000, 2, signal()), {
      code: 'SOURCE_CHANGED',
    });
  } finally {
    await source?.dispose();
    globalThis.fetch = original;
  }
});
