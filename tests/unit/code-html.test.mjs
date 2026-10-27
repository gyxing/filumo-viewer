import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
const out = await build({
  entryPoints: ['packages/code/src/runtime/openCode.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  alias: {
    '@filumo/core': resolve('packages/core/src/index.ts'),
    '@filumo/core/text': resolve('packages/core/src/text.ts'),
  },
});
const { openCode } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(out.outputFiles[0].text).toString('base64')
);
test('HTML 身份取决于输入，手动语法不让普通文件成为 HTML', async () => {
  for (const [name, language, expected] of [
    ['sample.html', 'plaintext', true],
    ['sample.txt', 'html', false],
  ]) {
    const abort = new AbortController();
    const source = {
      name,
      readAll: async () => new TextEncoder().encode('<p>hello</p>'),
      dispose: async () => {},
    };
    const session = await openCode(
      source,
      { sessionId: name, signal: abort.signal, reportProgress() {} },
      {
        language,
        worker: 'never',
        workerFactory: () => {
          throw Error('不应创建');
        },
      },
    );
    assert.equal(session.data.htmlDocument, expected);
    assert.equal(session.data.content.document.text, '<p>hello</p>');
    await session.dispose();
  }
});
