import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

const output = await build({
  stdin: {
    contents: `export * from './packages/markdown/src/view/hasHtmlTokens';
    export * from './packages/markdown/src/view/htmlPolicy';`,
    resolveDir: resolve('.'),
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const { hasHtmlTokens, htmlDimension, allowedHtmlStyle } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'),
);

test('HTML 模块只识别真实 HTML，代码与原文中的标签不触发加载', () => {
  assert.equal(hasHtmlTokens([{ type: 'codespan', text: '<br/>' }]), false);
  assert.equal(hasHtmlTokens([{ type: 'code', text: '<table></table>' }]), false);
  assert.equal(hasHtmlTokens([{ type: 'text', text: '&lt;br/&gt;' }]), false);
  assert.equal(hasHtmlTokens([{ type: 'image', tokens: [{ type: 'html', raw: '<b>' }] }]), false);
  assert.equal(hasHtmlTokens([{ type: 'paragraph', tokens: [
    { type: 'text', text: '文字' }, { type: 'html', raw: '<br/>' },
  ] }]), true);
  assert.equal(hasHtmlTokens([{ type: 'table', rows: [[{
    text: '', tokens: [{ type: 'html', raw: '<a href="#x">' }],
  }]] }]), true);
});

test('HTML 尺寸与样式限制保留排版，拒绝资源、定位和任意表达式', () => {
  assert.equal(htmlDimension('400'), '400px');
  assert.equal(htmlDimension('75%'), '75%');
  assert.equal(htmlDimension('-1px'), undefined);
  assert.equal(htmlDimension('999999px'), undefined);
  assert.equal(allowedHtmlStyle('text-align', 'center'), true);
  assert.equal(allowedHtmlStyle('color', 'rgb(128, 0, 0)'), true);
  assert.equal(allowedHtmlStyle('position', 'fixed'), false);
  assert.equal(allowedHtmlStyle('background-image', 'url(https://invalid.example)'), false);
  assert.equal(allowedHtmlStyle('color', 'var(--host-secret)'), false);
  assert.equal(allowedHtmlStyle('font-size', '9999px'), false);
  assert.equal(allowedHtmlStyle('border', '99999em solid red'), false);
  assert.equal(allowedHtmlStyle('border', 'calc(8px * 1000000) solid red'), false);
  assert.equal(allowedHtmlStyle('border', '1px solid rgb(128, 0, 0)'), true);
});
