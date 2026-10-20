import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const result = await build({
  entryPoints: ['packages/dom/src/text-highlight.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { highlightToDecorations } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')
);
test('公共高亮转换在没有 DOM 的环境保留原文与嵌套类', () => {
  const ranges = highlightToDecorations(
    '中<&',
    '<span class="hljs-string">中&lt;<span class="hljs-title function_">&amp;</span></span>',
    10,
  );
  assert.equal(ranges[0].start, 0);
  assert.equal(ranges.at(-1).end, 3);
  assert.match(ranges.at(-1).className, /function_/);
  assert.equal(highlightToDecorations('a', '<img src=x>a', 10), undefined);
  assert.equal(
    highlightToDecorations('a', '<span onclick="x">a</span>', 10),
    undefined,
  );
  assert.equal(highlightToDecorations('a', 'b', 10), undefined);
  assert.equal(
    highlightToDecorations('a', '<span class="hljs-string">a</span>', 0),
    undefined,
  );
});
