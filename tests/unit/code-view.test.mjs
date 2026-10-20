import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
const result = await build({
  entryPoints: ['packages/code/src/runtime/CodeSession.ts'],
  alias: { '@fivo/core/text': resolve('packages/core/src/text.ts') },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});

const { CodeSession } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')
);

test('Code 高亮输入边界与切换语法后缓存按语言隔离', async () => {
  let requests = 0;
  const factory = () => {
    const listeners = new Map();
    return {
      addEventListener(type, callback) {
        listeners.set(type, callback);
      },
      removeEventListener(type) {
        listeners.delete(type);
      },
      postMessage(message) {
        if (message.cancel) return;
        requests++;
        queueMicrotask(() =>
          listeners.get('message')?.({
            data: {
              id: message.id,
              task: message.task,
              ok: true,
              value: {
                kind: 'ready',
                decorations: [{ start: 0, end: 1, className: 'hljs-keyword' }],
              },
            },
          }),
        );
      },
      terminate() {},
    };
  };
  const content = {
    document: { text: 'x'.repeat(262144) },
    revision: 1,
    taskSignal: new AbortController().signal,
  };
  const session = new CodeSession(
    content,
    { workerFactory: factory },
    'typescript',
  );
  assert.equal((await session.ensureHighlight()).kind, 'ready');
  await session.ensureHighlight();
  assert.equal(requests, 1);
  session.setLanguage('javascript');
  await session.ensureHighlight();
  assert.equal(requests, 2);
  content.document.text += 'x';
  content.revision++;
  assert.equal((await session.ensureHighlight()).reason, 'limit');
  assert.equal(requests, 2);
  session.dispose();
});
test('Code 明确关闭 Worker 与超预算保留原文', async () => {
  const text = '<script>原文</script>',
    content = {
      document: { text },
      revision: 1,
      taskSignal: new AbortController().signal,
    };
  const disabled = new CodeSession(
    content,
    {
      worker: 'never',
      workerFactory() {
        throw Error('不应创建');
      },
    },
    'html',
  );
  assert.equal((await disabled.ensureHighlight()).reason, 'disabled');
  assert.equal(content.document.text, text);
  const limited = new CodeSession(
    content,
    {
      maxHighlightChars: 1,
      workerFactory() {
        throw Error('不应创建');
      },
    },
    'html',
  );
  assert.equal((await limited.ensureHighlight()).reason, 'limit');
  disabled.setLanguage('plaintext');
  disabled.setActive(false);
  disabled.dispose();
  limited.dispose();
});
