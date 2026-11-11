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

test(
  '响应头尚未到达时取消探测会终止真实请求信号',
  { timeout: 5000 },
  async () => {
    const original = globalThis.fetch;
    let markStarted, requestSignal;
    const started = new Promise((resolve) => {
      markStarted = resolve;
    });
    globalThis.fetch = (_url, options) => {
      requestSignal = options.signal;
      markStarted();
      return new Promise((_resolve, reject) =>
        requestSignal.addEventListener(
          'abort',
          () => reject(requestSignal.reason),
          { once: true },
        ),
      );
    };
    const source = await normalizeSource('https://example.test/pending');
    try {
      const abort = new AbortController();
      const pending = source.readRange(0, 8, abort.signal);
      const rejected = assert.rejects(pending, { name: 'AbortError' });
      await started;
      abort.abort();
      await rejected;
      assert.equal(requestSignal.aborted, true);
    } finally {
      await source.dispose();
      globalThis.fetch = original;
    }
  },
);

/** 用有限分块响应观察真实来源的消费与取消，旧实现不会因无限流挂起。 */
function prefixResponse(data, stats, headers = {}) {
  let offset = 0;
  return new Response(
    new ReadableStream(
      {
        pull(controller) {
          if (offset === data.length) return controller.close();
          const next = Math.min(data.length, offset + 4096);
          stats.consumed += next - offset;
          controller.enqueue(data.slice(offset, next));
          offset = next;
        },
        cancel() {
          stats.cancelled++;
        },
      },
      { highWaterMark: 0 },
    ),
    { headers },
  );
}

test('超大请求窗口的小文件按实际内容分配，不提前分配窗口大小', async () => {
  const original = globalThis.fetch;
  const stats = { consumed: 0, cancelled: 0 };
  globalThis.fetch = async () =>
    prefixResponse(new TextEncoder().encode('small'), stats);
  const source = await normalizeSource('https://example.test/small');
  try {
    assert.equal(
      new TextDecoder().decode(
        await source.readRange(0, Number.MAX_SAFE_INTEGER, signal()),
      ),
      'small',
    );
    assert.equal(source.size, 5);
  } finally {
    await source.dispose();
    globalThis.fetch = original;
  }
});

test('压缩传输声明的长度不被误用为解码后文件大小或前缀窗口', async () => {
  const original = globalThis.fetch;
  const stats = { consumed: 0, cancelled: 0 };
  globalThis.fetch = async () =>
    prefixResponse(new Uint8Array(256 * 1024).fill(1), stats, {
      'content-length': '100',
      'content-encoding': 'gzip',
    });
  const source = await normalizeSource('https://example.test/encoded');
  try {
    assert.equal((await source.readRange(0, 8, signal())).length, 8);
    assert.equal(source.size, undefined);
    assert.equal(stats.consumed, 65536);
    assert.equal(stats.cancelled, 1);
  } finally {
    await source.dispose();
    globalThis.fetch = original;
  }
});

test('200 多次前缀共用有界缓存，正常截断后仍能完整读取', async () => {
  const original = globalThis.fetch;
  const data = Uint8Array.from({ length: 256 * 1024 }, (_, i) => i % 251);
  const stats = { consumed: 0, cancelled: 0, requests: 0 };
  globalThis.fetch = async () => {
    stats.requests++;
    return prefixResponse(data, stats);
  };
  const source = await normalizeSource('https://example.test/123');
  try {
    const first = await source.readRange(0, 8, signal());
    first[0] = 255;
    assert.deepEqual(
      await source.readRange(0, 32, signal()),
      data.slice(0, 32),
    );
    assert.deepEqual(
      await source.readRange(0, 65536, signal()),
      data.slice(0, 65536),
    );
    assert.equal(stats.requests, 1);
    assert.equal(stats.consumed, 65536);
    assert.equal(stats.cancelled, 1);
    assert.equal(source.size, undefined);
    assert.deepEqual(await source.readAll(signal()), data);
    assert.equal(stats.requests, 2);
  } finally {
    await source.dispose();
    globalThis.fetch = original;
  }
});

test('206 前缀复用首块，不为多个探测发送全文请求', async () => {
  const original = globalThis.fetch;
  const data = new Uint8Array(512 * 1024).fill(17);
  const ranges = [];
  globalThis.fetch = async (_url, options) => {
    const range = new Headers(options.headers).get('range');
    ranges.push(range);
    assert.equal(range, 'bytes=0-262143');
    return new Response(data.slice(0, 262144), {
      status: 206,
      headers: { 'content-range': 'bytes 0-262143/524288' },
    });
  };
  const source = await normalizeSource('https://example.test/123');
  try {
    assert.deepEqual(
      await source.readRange(0, 8, signal()),
      new Uint8Array(8).fill(17),
    );
    assert.equal((await source.readRange(0, 65536, signal())).length, 65536);
    assert.equal(ranges.length, 1);
    assert.equal(source.size, 524288);
  } finally {
    await source.dispose();
    globalThis.fetch = original;
  }
});

test('小文件真实 EOF 升级全文缓存，零长度不请求网络', async () => {
  const original = globalThis.fetch;
  let requests = 0;
  const stats = { consumed: 0, cancelled: 0 };
  globalThis.fetch = async () => {
    requests++;
    return prefixResponse(new TextEncoder().encode('small'), stats);
  };
  const source = await normalizeSource('https://example.test/small');
  try {
    assert.equal((await source.readRange(0, 0, signal())).length, 0);
    assert.equal(requests, 0);
    assert.equal(
      new TextDecoder().decode(await source.readRange(0, 8, signal())),
      'small',
    );
    assert.equal(source.size, 5);
    assert.equal(
      new TextDecoder().decode(await source.readAll(signal())),
      'small',
    );
    assert.equal(requests, 1);
  } finally {
    await source.dispose();
    globalThis.fetch = original;
  }
});

test('特殊请求的前缀与全文沿用一次下载，不重放请求', async () => {
  const original = globalThis.fetch;
  try {
    for (const request of [
      { method: 'POST', body: 'fixture' },
      { method: 'PUT', body: 'fixture' },
      { headers: { Range: 'bytes=0-99', authorization: 'Bearer fixture' } },
    ]) {
      let requests = 0;
      globalThis.fetch = async (_url, current) => {
        requests++;
        assert.equal(current.method, request.method);
        assert.equal(current.body, request.body);
        assert.equal(
          new Headers(current.headers).get('range'),
          new Headers(request.headers).get('range'),
        );
        return new Response('fixture');
      };
      const source = await normalizeSource({
        url: 'https://example.test/123',
        request,
      });
      try {
        assert.equal(
          new TextDecoder().decode(await source.readRange(0, 3, signal())),
          'fix',
        );
        assert.equal(
          new TextDecoder().decode(await source.readAll(signal())),
          'fixture',
        );
        assert.equal(requests, 1);
      } finally {
        await source.dispose();
      }
    }
  } finally {
    globalThis.fetch = original;
  }
});

test(
  '并发前缀与全文单向交接，大窗口不交付半份文件',
  { timeout: 5000 },
  async () => {
    const original = globalThis.fetch;
    const data = new Uint8Array(192 * 1024).fill(9);
    const stats = { consumed: 0, cancelled: 0, requests: 0 };
    globalThis.fetch = async () => {
      stats.requests++;
      return prefixResponse(data, stats);
    };
    const source = await normalizeSource('https://example.test/123');
    try {
      const [small, large, all] = await Promise.all([
        source.readRange(0, 8, signal()),
        source.readRange(0, 96000, signal()),
        source.readAll(signal()),
      ]);
      assert.equal(small.length, 8);
      assert.equal(large.length, 96000);
      assert.deepEqual(all, data);
      assert.ok(stats.requests <= 2);
    } finally {
      await source.dispose();
      globalThis.fetch = original;
    }
  },
);

test('探测中的迟到响应在销毁后取消，不能重新缓存', async () => {
  const original = globalThis.fetch;
  let deliver;
  const response = new Promise((resolve) => {
    deliver = resolve;
  });
  const stats = { consumed: 0, cancelled: 0 };
  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  globalThis.fetch = () => {
    markStarted();
    return response;
  };
  const source = await normalizeSource('https://example.test/123');
  try {
    const pending = source.readRange(0, 8, signal());
    const rejected = assert.rejects(pending);
    await started;
    await source.dispose();
    deliver(prefixResponse(new Uint8Array(128 * 1024), stats));
    await rejected;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(stats.cancelled, 1);
    await assert.rejects(source.readRange(0, 8, signal()), {
      code: 'SOURCE_DISPOSED',
    });
  } finally {
    await source.dispose();
    globalThis.fetch = original;
  }
});

test('大于常规窗口的探测有界返回，随后流读取仍是完整来源', async () => {
  const original = globalThis.fetch;
  const data = new Uint8Array(192 * 1024).fill(21);
  const stats = { consumed: 0, cancelled: 0 };
  globalThis.fetch = async () => prefixResponse(data, stats);
  const source = await normalizeSource('https://example.test/123');
  try {
    assert.equal((await source.readRange(0, 96000, signal())).length, 96000);
    assert.ok(stats.consumed < data.length);
    const stream = await source.openStream(signal());
    assert.deepEqual(
      new Uint8Array(await new Response(stream).arrayBuffer()),
      data,
    );
  } finally {
    await source.dispose();
    globalThis.fetch = original;
  }
});

test('前缀读取保留已知与未知大小限额和鉴权失败', async () => {
  const original = globalThis.fetch;
  try {
    for (const headers of [{ 'content-length': '131072' }, {}]) {
      const stats = { consumed: 0, cancelled: 0 };
      globalThis.fetch = async () =>
        prefixResponse(new Uint8Array(131072), stats, headers);
      const source = await normalizeSource('https://example.test/123', {
        resourcePolicy: { maxFileBytes: 1000 },
      });
      try {
        await assert.rejects(source.readRange(0, 8, signal()), {
          code: 'FILE_SIZE_LIMIT_EXCEEDED',
        });
        assert.equal(stats.cancelled, 1);
      } finally {
        await source.dispose();
      }
    }
    globalThis.fetch = async () => new Response('', { status: 403 });
    const source = await normalizeSource('https://example.test/123');
    try {
      await assert.rejects(source.readRange(0, 8, signal()), {
        code: 'DOWNLOAD_FAILED',
      });
    } finally {
      await source.dispose();
    }
  } finally {
    globalThis.fetch = original;
  }
});

test('无响应流的环境保留全文回退并缓存结果', async () => {
  const original = globalThis.fetch;
  let requests = 0;
  const data = new TextEncoder().encode('bodyless');
  globalThis.fetch = async () => {
    requests++;
    return {
      status: 200,
      ok: true,
      headers: new Headers(),
      body: null,
      arrayBuffer: async () => data.buffer,
    };
  };
  const source = await normalizeSource('https://example.test/123');
  try {
    assert.equal(
      new TextDecoder().decode(await source.readRange(0, 4, signal())),
      'body',
    );
    assert.deepEqual(await source.readAll(signal()), data);
    assert.equal(requests, 1);
  } finally {
    await source.dispose();
    globalThis.fetch = original;
  }
});

test(
  '探测消费中的主动取消释放上游且不交付缓存',
  { timeout: 5000 },
  async () => {
    const original = globalThis.fetch;
    let markPull,
      cancelled = 0;
    const pulling = new Promise((resolve) => {
      markPull = resolve;
    });
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream(
          {
            pull() {
              markPull();
              return new Promise(() => {});
            },
            cancel() {
              cancelled++;
            },
          },
          { highWaterMark: 0 },
        ),
      );
    const source = await normalizeSource('https://example.test/123');
    try {
      const abort = new AbortController();
      const pending = source.readRange(0, 8, abort.signal);
      const rejected = assert.rejects(pending, { name: 'AbortError' });
      await pulling;
      abort.abort();
      await rejected;
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(cancelled, 1);
      assert.equal(source.size, undefined);
    } finally {
      await source.dispose();
      globalThis.fetch = original;
    }
  },
);
