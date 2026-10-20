import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { serializeStyles } from '../../scripts/build/style-order.mjs';
test('外部 CSS 按稳定路径顺序生成，不依赖异步编译完成顺序', () => {
  const first = new Map([
    ['styles/z.less', 'z{}'],
    ['styles/a.less', 'a{}'],
  ]);
  const second = new Map([...first].reverse());
  assert.equal(serializeStyles(first), serializeStyles(second));
  assert.equal(serializeStyles(first), 'a{}\nz{}');
});

test('公共原文与分栏样式在兼容转导出后仍保留副作用', async () => {
  const manifest = JSON.parse(
    await readFile('packages/dom/package.json', 'utf8'),
  );
  for (const file of [
    './src/text/mountTextSurface.ts',
    './src/split/SplitHandle.ts',
    './dist/text.js',
    './dist/split.js',
  ])
    assert.ok(manifest.sideEffects.includes(file), file);
  const css = await readFile('packages/dom/dist/styles.css', 'utf8');
  assert.match(css, /\.fivo-text-scope/);
  assert.match(css, /\.fivo-split-handle/);
  const textCss = await readFile('packages/text/dist/styles.css', 'utf8');
  assert.doesNotMatch(textCss, /\.fivo-text-row/);
});
