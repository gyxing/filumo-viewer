import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocumentController, createSession, FivoError } from '../../packages/core/dist/index.js';
import { text } from '../../packages/text/dist/index.js';

/** 使用真实文本驱动，探测和解码均不依赖浏览器或 Worker。 */
function controller(options = {}) {
  return createDocumentController({ plugins: [text({ worker: 'never', ...options }).document] });
}

for (const [name, bytes, encoding] of [
  ['query.sql', new TextEncoder().encode('select 1;'), 'utf-8'],
  ['settings.custom', Uint8Array.of(0xd6, 0xd0, 0xce, 0xc4), 'gb18030'],
  ['无后缀', Uint8Array.of(0xff, 0xfe, 0x2d, 0x4e, 0x87, 0x65), 'utf-16le'],
  ['empty.unknown', new Uint8Array(), 'utf-8'],
  ['heading.custom', new TextEncoder().encode('MZ 和 BM 也可以是普通文字开头'), 'utf-8'],
]) {
  test('未知格式自动按文本读取：' + name, async () => {
    const view = controller();
    try {
      await view.open(new File([bytes], name));
      const snapshot = view.getSnapshot();
      assert.equal(snapshot.pluginId, 'text');
      assert.equal(snapshot.session.source.name, name);
      assert.equal(snapshot.session.data.content.document.encoding, encoding);
    } finally { await view.destroy(); }
  });
}

test('所有常规插件都有匹配机会，误报的 text/plain 不能抢占专用格式', async () => {
  let fallbackCalls = 0;
  const plain = text({ worker: 'never' }).document;
  const detectFallback = plain.detectFallback;
  const view = createDocumentController({ plugins: [
    { ...plain, detectFallback: (...args) => { fallbackCalls++; return detectFallback(...args); } },
    {
      id: 'special', protocolVersion: 1, priority: -100, extensions: [], mimeTypes: [],
      detect: async () => true,
      load: async () => ({ open: async (source, context) => createSession({
        ...context, source, format: 'special', data: {},
      }) }),
    },
  ] });
  try {
    await view.open(new File(['plain-looking data'], 'x.unknown', { type: 'text/plain' }));
    assert.equal(view.getSnapshot().pluginId, 'special');
    assert.equal(fallbackCalls, 0);
  } finally { await view.destroy(); }
});

test('专用驱动加载或解析失败时不改用文本', async () => {
  let fallbackCalls = 0;
  const plain = text({ worker: 'never' }).document;
  const view = createDocumentController({ plugins: [
    { ...plain, detectFallback: async () => { fallbackCalls++; return true; } },
    {
      id: 'broken', protocolVersion: 1, extensions: ['.broken'], mimeTypes: [],
      detect: async () => true,
      load: async () => ({ open: async () => { throw new FivoError('DAMAGED_DOCUMENT', '文件损坏'); } }),
    },
  ] });
  try {
    await assert.rejects(view.open(new File(['text'], 'x.broken')), { code: 'DAMAGED_DOCUMENT' });
    assert.equal(fallbackCalls, 0);
  } finally { await view.destroy(); }
});

test('关闭兜底不影响显式选择 text，未注册文本插件不隐式加载文本', async () => {
  const view = controller({ fallback: false });
  try {
    await assert.rejects(view.open(new File(['hello'], 'x.custom')), { code: 'UNSUPPORTED_FORMAT' });
    await view.open(new File(['hello'], 'x.custom'), { pluginId: 'text' });
    assert.equal(view.getSnapshot().session.data.content.document.text, 'hello');
  } finally { await view.destroy(); }
  const empty = createDocumentController({ plugins: [] });
  try {
    await assert.rejects(empty.open(new File(['hello'], 'x.custom')), { code: 'UNSUPPORTED_FORMAT' });
  } finally { await empty.destroy(); }
});

test('明显二进制在加载文本驱动之前被拒绝，ASCII PDF 也不能当作文本', async () => {
  let loads = 0;
  const plugin = text({ worker: 'never' }).document;
  const originalLoad = plugin.load;
  const view = createDocumentController({ plugins: [{
    ...plugin, load: () => { loads++; return originalLoad(); },
  }] });
  try {
    for (const bytes of [
      new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj'),
      Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
      Uint8Array.of(80, 75, 3, 4, 0, 0),
      Uint8Array.of(0x7f, 69, 76, 70),
    ]) {
      await assert.rejects(view.open(new File([bytes], 'x.custom')), { code: 'UNSUPPORTED_FORMAT' });
    }
    assert.equal(loads, 0);
  } finally { await view.destroy(); }
});

test('前缀是文本但尾部包含二进制时全文校验拒绝，来源只完整读取一次并释放', async () => {
  const bytes = new Uint8Array(70 * 1024).fill(65);
  bytes[bytes.length - 1] = 0;
  let reads = 0, releases = 0;
  const view = controller({ encoding: 'gbk' });
  try {
    await assert.rejects(view.open(() => ({
      name: 'mixed.custom', size: bytes.length,
      readRange: async (offset, length) => bytes.slice(offset, offset + length),
      readAll: async () => { reads++; return bytes; },
      dispose: async () => { releases++; },
    })), { code: 'UNSUPPORTED_FORMAT' });
    assert.equal(reads, 1);
    assert.equal(releases, 1);
  } finally { await view.destroy(); }
  assert.equal(releases, 1);
});

test('探测边界截断多字节字符不误判，完整解码仍验证文件末尾', async () => {
  const view = controller();
  try {
    const source = 'a'.repeat(65535) + '中文';
    await view.open(new File([source], 'boundary.custom'));
    assert.equal(view.getSnapshot().session.data.content.document.text, source);
    const wide = 'a'.repeat(32766) + '😀中文';
    await view.open(new File([
      Uint8Array.of(0xff, 0xfe), new Uint8Array(Buffer.from(wide, 'utf16le')),
    ], 'wide-boundary.custom'));
    assert.equal(view.getSnapshot().session.data.content.document.text, wide);
    assert.equal(view.getSnapshot().session.data.content.document.encoding, 'utf-16le');
    const withoutBom = new Uint8Array(Buffer.from('Hello中文', 'utf16le'));
    await view.open(() => ({
      name: 'short-range.custom', size: withoutBom.length,
      readRange: async () => withoutBom.slice(0, 5),
      readAll: async () => withoutBom, dispose: async () => {},
    }));
    assert.equal(view.getSnapshot().session.data.content.document.text, 'Hello中文');
    const invalid = new Uint8Array(65536).fill(65);
    invalid[invalid.length - 1] = 0xff;
    await assert.rejects(view.open(new File([invalid], 'invalid.custom')), { code: 'UNSUPPORTED_FORMAT' });
  } finally { await view.destroy(); }
});

test('远程探测与完整读取复用请求，URL 不因兜底重复下载', async () => {
  const previousFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return new Response('配置内容', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  };
  const view = controller();
  try {
    await view.open('https://example.test/config.custom');
    assert.equal(view.getSnapshot().session.data.content.document.text, '配置内容');
    assert.equal(requests, 1);
  } finally {
    try { await view.destroy(); } finally { globalThis.fetch = previousFetch; }
  }
});

test('探测读到远程 MIME 后重新匹配专用插件，不抢先加载文本驱动', async () => {
  const previousFetch = globalThis.fetch;
  let requests = 0, textLoads = 0;
  globalThis.fetch = async () => {
    requests++;
    return new Response('special data', { headers: { 'content-type': 'application/x-special' } });
  };
  const plain = text({ worker: 'never' }).document;
  const originalLoad = plain.load;
  const view = createDocumentController({ plugins: [
    { ...plain, load: () => { textLoads++; return originalLoad(); } },
    {
      id: 'special', protocolVersion: 1, extensions: [], mimeTypes: ['application/x-special'],
      detect: async (source) => source.mimeType === 'application/x-special',
      load: async () => ({ open: async (source, context) => createSession({
        ...context, source, format: 'special', data: await source.readAll(context.signal),
      }) }),
    },
  ] });
  try {
    await view.open('https://example.test/download');
    assert.equal(view.getSnapshot().pluginId, 'special');
    assert.equal(textLoads, 0);
    assert.equal(requests, 1);
  } finally {
    try { await view.destroy(); } finally { globalThis.fetch = previousFetch; }
  }
});

test('探测遵守小文件配额，读取失败保持原始错误类型', async () => {
  const plugin = text({ worker: 'never' }).document;
  const policy = { maxFileBytes: 4 };
  let requested = 0;
  const view = createDocumentController({ plugins: [plugin], resourcePolicy: policy });
  try {
    await view.open(() => ({
      name: 'small.custom', size: 1,
      readRange: async (_, length) => { requested = length; return Uint8Array.of(65); },
      readAll: async () => Uint8Array.of(65), dispose: async () => {},
    }));
    assert.equal(requested, 1);
    const oversized = new Uint8Array(5).fill(65);
    await assert.rejects(view.open(() => ({
      name: 'oversized.custom',
      readRange: async (offset, length) => oversized.slice(offset, offset + length),
      readAll: async () => oversized, dispose: async () => {},
    })), { code: 'FILE_SIZE_LIMIT_EXCEEDED' });
    await assert.rejects(view.open(() => ({
      name: 'failed.custom',
      readRange: async () => { throw new FivoError('NETWORK_FAILURE', '读取失败'); },
      readAll: async () => new Uint8Array(), dispose: async () => {},
    })), { code: 'NETWORK_FAILURE' });
  } finally { await view.destroy(); }
});

test('迟到的兜底探测不能覆盖下一份文档或启动旧驱动', { timeout: 5000 }, async () => {
  let enter, finish;
  const entered = new Promise((resolve) => { enter = resolve; });
  const pending = new Promise((resolve) => { finish = resolve; });
  let loads = 0;
  const view = createDocumentController({ plugins: [{
    id: 'slow', protocolVersion: 1, extensions: [], mimeTypes: [],
    detect: async (source) => source.name === 'new.file',
    detectFallback: async () => { enter(); await pending; return true; },
    load: async () => { loads++; return { open: async (source, context) =>
      createSession({ ...context, source, format: 'slow', data: {} }) }; },
  }] });
  try {
    const first = view.open(new File(['old'], 'old.file')).catch((error) => error);
    await entered;
    await view.open(new File(['new'], 'new.file'));
    finish();
    assert.equal((await first).name, 'AbortError');
    assert.equal(view.getSnapshot().session.source.name, 'new.file');
    assert.equal(loads, 1);
  } finally { finish(); await view.destroy(); }
});
