import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TextContent,
  TextTaskClient,
  decodeTextTask,
  findTextMatches,
  readText,
} from '../../packages/text/dist/reader.js';
const options = () => ({
  signal: new AbortController().signal,
  encoding: 'auto',
});

test('自动读取 UTF-8、UTF-16 BOM 与 GB18030，保留原始字节', async () => {
  const source = Uint8Array.of(0xd6, 0xd0, 0xce, 0xc4),
    before = source.slice();
  const detected = await readText(source, options());
  assert.equal(detected.document.text, '中文');
  assert.equal(detected.document.encoding, 'gb18030');
  assert.equal(
    (await readText(source, { ...options(), encoding: 'gbk' })).document.text,
    '中文',
  );
  assert.deepEqual(source, before);
  assert.equal(
    (
      await readText(
        Uint8Array.of(0xff, 0xfe, 0x2d, 0x4e, 0x87, 0x65),
        options(),
      )
    ).document.text,
    '中文',
  );
  assert.equal(
    (
      await readText(
        Uint8Array.of(0xfe, 0xff, 0x4e, 0x2d, 0x65, 0x87),
        options(),
      )
    ).document.text,
    '中文',
  );
  const mixed = (
    await readText(new TextEncoder().encode('a\r\nb\nc\rd'), options())
  ).document;
  assert.deepEqual([...mixed.lineStarts], [0, 3, 5, 7]);
  assert.equal(mixed.newline, 'mixed');
  assert.deepEqual(
    [...(await readText(new Uint8Array(), options())).document.lineStarts],
    [0],
  );
});

test('查找保留源偏移、处理全词与取消', async () => {
  const model = (
    await readText(new TextEncoder().encode('a.b A.B\r\nabc a.b'), options())
  ).document;
  const found = [];
  for await (const batch of findTextMatches(
    model,
    'a.b',
    { matchCase: false, wholeWord: false },
    options().signal,
  ))
    found.push(...batch);
  assert.deepEqual(
    found.map((hit) => hit.start),
    [0, 4, 13],
  );
  assert.deepEqual(
    found.map((hit) => hit.line),
    [0, 0, 1],
  );
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(async () => {
    for await (const batch of findTextMatches(
      model,
      'a',
      { matchCase: true, wholeWord: true },
      abort.signal,
    ))
      void batch;
  });
});

test('任务构造不创建 Worker，auto 可降级，always 不静默降级', async () => {
  let created = 0;
  const config = {
    factory: () => {
      created++;
      throw Error('missing');
    },
    executeLocal: async () => 'local',
  };
  const client = new TextTaskClient({ ...config, mode: 'auto' });
  assert.equal(created, 0);
  assert.equal(await client.run('decode', {}, options().signal), 'local');
  assert.equal(created, 1);
  client.dispose();
  await assert.rejects(client.run('decode', {}, options().signal));
  const strict = new TextTaskClient({ ...config, mode: 'always' });
  await assert.rejects(strict.run('decode', {}, options().signal), /missing/);
  strict.dispose();
});

test('同一文件切换编码不再次读取来源，销毁使结果失效', async () => {
  const content = new TextContent(
    Uint8Array.of(0xd6, 0xd0, 0xce, 0xc4),
    {
      worker: 'never',
      workerFactory: () => {
        throw Error('不应创建');
      },
    },
    options().signal,
  );
  await content.setEncoding('auto');
  assert.equal(content.document.text, '中文');
  await content.setEncoding('gb18030');
  assert.equal(content.document.text, '中文');
  content.dispose();
  assert.equal(content.document, undefined);
  await assert.rejects(content.setEncoding('auto'));
});

test('自动模式使用 charset，BOM 与手动编码保持更高优先级', async () => {
  const bytes = new TextEncoder().encode('中文');
  const declared = await readText(bytes, {
    ...options(),
    mimeType: 'text/plain; charset="UTF-8"',
  });
  assert.equal(declared.document.text, '中文');
  const gbk = Uint8Array.of(0xd6, 0xd0, 0xce, 0xc4);
  assert.equal(
    (
      await readText(gbk, {
        ...options(),
        mimeType: 'text/plain; charset=gb2312',
      })
    ).document.encoding,
    'gbk',
  );
  assert.equal(
    (
      await readText(gbk, {
        ...options(),
        mimeType: 'text/plain; charset=utf-8',
      })
    ).document.text,
    '中文',
  );
  assert.equal(
    (
      await readText(bytes, {
        ...options(),
        mimeType: 'text/plain; charset=unknown',
      })
    ).document.text,
    '中文',
  );
  const bom = Uint8Array.from([0xef, 0xbb, 0xbf, ...bytes]);
  assert.equal(
    (await readText(bom, { ...options(), mimeType: 'text/plain; charset=gbk' }))
      .document.encoding,
    'utf-8',
  );
  assert.equal(
    (
      await readText(bytes, {
        ...options(),
        encoding: 'utf-8',
        mimeType: 'text/plain; charset=gbk',
      })
    ).document.text,
    '中文',
  );
  const utf16 = new Uint8Array(Buffer.from('中文', 'utf16le'));
  assert.equal(
    (
      await readText(utf16, {
        ...options(),
        mimeType: 'text/plain;charset=utf-16le',
      })
    ).document.text,
    '中文',
  );
});

test('切换编码失败保留成功内容、编码、版本和解析信号，成功后才提交', async () => {
  const content = new TextContent(new TextEncoder().encode('abc'), {
    worker: 'never', workerFactory: () => { throw Error('不应创建'); },
  }, options().signal);
  try {
    await content.setEncoding('utf-8');
    const document = content.document, revision = content.revision, task = content.taskSignal;
    const pending = content.setEncoding('utf-16le');
    assert.equal(content.loading, true);
    assert.equal(content.document, document);
    assert.equal(task.aborted, false);
    await pending;
    assert.equal(content.document, document);
    assert.equal(content.encoding, 'utf-8');
    assert.equal(content.revision, revision);
    assert.equal(content.taskSignal, task);
    assert.equal(task.aborted, false);
    assert.equal(content.warning.encoding, 'utf-16le');
    assert.equal(content.warning.retainedEncoding, 'utf-8');
    const warningId = content.warning.id;
    await content.setEncoding('utf-16le');
    assert.ok(content.warning.id > warningId);
    await content.setEncoding('auto');
    assert.equal(content.warning, undefined);
    assert.equal(content.document.text, 'abc');
    assert.equal(content.encoding, 'auto');
    assert.equal(content.revision, revision + 1);
    assert.equal(task.aborted, true);
  } finally { content.dispose(); }
});

test('首次解码失败仍保留恢复状态，失败尝试不产生已提交内容版本', async () => {
  const content = new TextContent(new TextEncoder().encode('abc'), {
    worker: 'never', workerFactory: () => { throw Error('不应创建'); },
  }, options().signal);
  try {
    await content.setEncoding('utf-16le');
    assert.equal(content.document, undefined);
    assert.equal(content.result.kind, 'needs-encoding');
    assert.equal(content.encoding, 'utf-16le');
    assert.equal(content.revision, 0);
    assert.equal(content.warning, undefined);
    await content.setEncoding('utf-8');
    assert.equal(content.document.text, 'abc');
  } finally { content.dispose(); }
});

test('取消一个 Worker 请求不取消仍在使用原内容的其他请求', async () => {
  const listeners = new Map(), requests = [];
  let terminated = 0;
  const worker = {
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: (type) => listeners.delete(type),
    terminate: () => { terminated++; },
    postMessage: (request) => requests.push(request),
  };
  const client = new TextTaskClient({ mode: 'always', factory: () => worker,
    executeLocal: async () => { throw Error('不应降级'); } });
  try {
    const parsing = client.run('parse', {}, options().signal);
    const abort = new AbortController();
    const decoding = client.run('decode', {}, abort.signal);
    abort.abort();
    await assert.rejects(decoding, { name: 'AbortError' });
    assert.equal(terminated, 0);
    listeners.get('message')({ data: { ...requests[0], ok: true, value: '原内容解析' } });
    assert.equal(await parsing, '原内容解析');
  } finally { client.dispose(); }
});

test('连续切换编码以最新请求为准，迟到失败和销毁结果不覆盖当前内容', async () => {
  const listeners = new Map(), requests = [], cancellations = [];
  const worker = {
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: (type) => listeners.delete(type),
    terminate() {},
    // 取消信封不属于新任务；单独记录，避免回复错位后把最新任务永久挂起。
    postMessage: (request) => {
      if (request.cancel) cancellations.push(request);
      else requests.push(request);
    },
  };
  const content = new TextContent(new TextEncoder().encode('abc'), {
    worker: 'always', workerFactory: () => worker,
  }, options().signal);
  const ready = { kind: 'ready', document: { text: 'abc', encoding: 'utf-8',
    lineStarts: Uint32Array.of(0), newline: 'none' } };
  const reply = (request, value) => listeners.get('message')?.({ data: { ...request, ok: true, value } });
  try {
    const initial = content.setEncoding('utf-8');
    reply(requests[0], ready);
    await initial;
    const first = content.setEncoding('utf-16le');
    const second = content.setEncoding('auto');
    assert.deepEqual(cancellations.map((request) => request.id), [requests[1].id]);
    reply(requests[2], ready);
    await second;
    reply(requests[1], { kind: 'needs-encoding', reason: '迟到失败' });
    await first;
    assert.equal(content.document.text, 'abc');
    assert.equal(content.encoding, 'auto');
    assert.equal(content.warning, undefined);
    assert.equal(content.loading, false);
    assert.equal(content.revision, 2);
    const last = content.setEncoding('utf-16le');
    content.dispose();
    reply(requests[3], ready);
    await last;
    assert.equal(content.document, undefined);
    assert.equal(content.warning, undefined);
  } finally { content.dispose(); }
});

test('Worker 解码任务和本地读取使用同一来源声明，任务取消不会被降级吞掉', async () => {
  const result = await decodeTextTask(
    {
      bytes: Uint8Array.of(0xd6, 0xd0, 0xce, 0xc4),
      mimeType: 'text/plain;charset=gbk',
    },
    options().signal,
  );
  assert.equal(result.document.encoding, 'gbk');
  await assert.rejects(
    decodeTextTask(
      { bytes: new Uint8Array(), mimeType: 123 },
      options().signal,
    ),
    /来源类型/,
  );
  const controller = new AbortController();
  const pending = readText(new TextEncoder().encode('text '.repeat(100000)), {
    ...options(),
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending);
});

test('无 BOM 的 UTF-16 按字节特征识别，GB18030 四字节字符保持完整', async () => {
  const le = new Uint8Array(
    Buffer.from('Hello 中文\r\nSecond line', 'utf16le'),
  );
  const be = le.slice();
  for (let index = 0; index < be.length; index += 2)
    [be[index], be[index + 1]] = [be[index + 1], be[index]];
  for (const [bytes, encoding] of [
    [le, 'utf-16le'],
    [be, 'utf-16be'],
  ]) {
    const result = await readText(bytes, options());
    assert.equal(result.document.encoding, encoding);
    assert.equal(result.document.text, 'Hello 中文\r\nSecond line');
  }
  const four = await readText(Uint8Array.of(0x94, 0x39, 0xfc, 0x36), options());
  assert.equal(four.document.text, '😀');
  assert.equal(four.document.encoding, 'gb18030');
  assert.equal(
    (await readText(new TextEncoder().encode('ASCII only'), options())).document
      .encoding,
    'utf-8',
  );
});

test('非法字节、二进制内容与不支持的 BOM 不自动显示为正文', async () => {
  for (const bytes of [
    Uint8Array.of(0xff),
    Uint8Array.of(1, 2, 3, 4),
    Uint8Array.of(0, 0, 0, 0),
    Uint8Array.of(0xff, 0xfe, 0, 0, 0x41, 0, 0, 0),
  ]) {
    assert.equal((await readText(bytes, options())).kind, 'needs-encoding');
  }
  const signal = new AbortController();
  signal.abort();
  await assert.rejects(
    readText(new TextEncoder().encode('valid'), {
      encoding: 'auto',
      signal: signal.signal,
    }),
  );
});

test('会话在 Worker 与本地路径传递来源 charset，重新选择自动仍然有效', async () => {
  const listeners = new Map();
  let payload;
  const worker = {
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    terminate() {},
    postMessage(message) {
      payload = message.payload;
      void readText(payload.bytes, {
        ...payload,
        signal: options().signal,
      }).then((value) =>
        listeners.get('message')?.({
          data: { id: message.id, task: message.task, ok: true, value },
        }),
      );
    },
  };
  for (const mode of ['never', 'always']) {
    const content = new TextContent(
      Uint8Array.of(0xd6, 0xd0, 0xce, 0xc4),
      {
        mimeType: 'text/plain;charset=gbk',
        worker: mode,
        workerFactory: () => worker,
      },
      options().signal,
    );
    await content.setEncoding('auto');
    assert.equal(content.document.encoding, 'gbk');
    await content.setEncoding('utf-8');
    assert.equal(content.result.kind, 'ready');
    assert.equal(content.document.encoding, 'gbk');
    assert.equal(content.warning.encoding, 'utf-8');
    await content.setEncoding('auto');
    assert.equal(content.document.text, '中文');
    assert.equal(content.encoding, 'auto');
    assert.equal(content.warning, undefined);
    content.dispose();
  }
  assert.equal(payload.mimeType, 'text/plain;charset=gbk');
});

test('三个格式在读取响应后取得 charset，切换编码不再次下载', async () => {
  const [{ text }, { json }, { markdown }] = await Promise.all([
    import('../../packages/text/dist/index.js'),
    import('../../packages/json/dist/index.js'),
    import('../../packages/markdown/dist/index.js'),
  ]);
  for (const factory of [text, json, markdown]) {
    let reads = 0,
      mimeType;
    const source = {
      get mimeType() {
        return mimeType;
      },
      async readAll() {
        reads++;
        mimeType = 'text/plain;charset=gbk';
        return Uint8Array.of(0xd6, 0xd0, 0xce, 0xc4);
      },
      async dispose() {},
    };
    const plugin = factory({ worker: 'never', initialMode: 'source' });
    const driver = await plugin.document.load();
    const session = await driver.open(source, {
      sessionId: 'encoding',
      signal: options().signal,
      reportProgress() {},
    });
    assert.equal(session.data.content.document.encoding, 'gbk');
    await session.data.content.setEncoding('utf-8');
    await session.data.content.setEncoding('auto');
    assert.equal(session.data.content.document.text, '中文');
    assert.equal(reads, 1);
    await session.dispose();
  }
});

test('取消进行中的 Worker 任务会终止进程，任务错误不会自动执行第二遍', async () => {
  const listeners = new Map();
  let request,
    terminated = 0,
    local = 0;
  const worker = {
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    postMessage(message) {
      request = message;
    },
    terminate() {
      terminated++;
    },
  };
  const client = new TextTaskClient({
    mode: 'auto',
    factory: () => worker,
    executeLocal: async () => {
      local++;
      return 'fallback';
    },
  });
  const controller = new AbortController(),
    pending = client.run('decode', {}, controller.signal);
  controller.abort();
  await assert.rejects(pending);
  assert.equal(terminated, 1);
  assert.equal(local, 0);
  const next = client.run('decode', {}, options().signal);
  listeners.get('message')({
    data: {
      id: request.id,
      task: request.task,
      ok: false,
      error: 'invalid input',
    },
  });
  await assert.rejects(next, /invalid input/);
  assert.equal(local, 0);
  client.dispose();
});
