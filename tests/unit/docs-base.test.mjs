import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeDocsBase,
  withDocsBase,
} from '../../apps/docs/config/base-path.js';

test('站点默认根路径，部署前缀只由显式配置决定', () => {
  for (const value of [undefined, '', ' ', '/'])
    assert.equal(normalizeDocsBase(value), '/');
  assert.equal(normalizeDocsBase('/preview'), '/preview/');
  assert.equal(normalizeDocsBase(' /nested/preview/ '), '/nested/preview/');
  assert.equal(withDocsBase('/', 'zh-CN/docs'), '/zh-CN/docs');
  assert.equal(
    withDocsBase('/preview/', '/dev/smoke-test'),
    '/preview/dev/smoke-test',
  );
  assert.equal(
    withDocsBase('/preview/', '__fivo_smoke/files/basic-docx'),
    '/preview/__fivo_smoke/files/basic-docx',
  );
});

test('非法站点前缀必须失败，不产生站外资源请求或目录穿越', () => {
  for (const value of [
    'https://example.com/',
    '//example.com/',
    'relative/',
    '/a/../b',
    '/a/./b',
    '/a//b',
    '/a?b',
    '/a#b',
    '/%2e%2e/',
    '/a\\b',
  ]) {
    assert.throws(() => normalizeDocsBase(value), /FIVO_DOCS_BASE/);
  }
});

import { build } from 'esbuild';
test('浏览器站内地址使用构建注入值，嵌套路由不改变资源根', async () => {
  for (const base of ['/', '/docs-preview/']) {
    const result = await build({
      entryPoints: ['apps/docs/src/site-path.ts'],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      define: { 'process.env.FIVO_DOCS_BASE': JSON.stringify(base) },
    });
    const app = await import(
      'data:text/javascript;base64,' +
        Buffer.from(result.outputFiles[0].text).toString('base64')
    );
    assert.equal(app.DOCS_BASE, base);
    assert.equal(
      app.docsPath('__fivo_smoke/samples'),
      base + '__fivo_smoke/samples',
    );
    assert.equal(
      app.docsPath('assets/example.svg'),
      base + 'assets/example.svg',
    );
  }
});
