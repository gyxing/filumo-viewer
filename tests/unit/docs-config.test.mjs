import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const result = await build({
  entryPoints: ['apps/docs/config/routes.ts'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
});
const module = { exports: {} };
const { createRequire } = await import('node:module');
new Function(
  'require',
  'module',
  'exports',
  '__dirname',
  result.outputFiles[0].text,
)(
  createRequire(import.meta.url),
  module,
  module.exports,
  process.cwd() + '/apps/docs/config',
);
test('生产配置永远没有本机烟测路由', () => {
  assert.equal(
    module.exports
      .getDocsRoutes({ production: true, smoke: true })
      .some((r) => r.path === '/dev/smoke-test'),
    false,
  );
  assert.ok(
    module.exports
      .getDocsRoutes({ production: false, smoke: true })
      .some((r) => r.path === '/dev/smoke-test'),
  );
});

test('只有烟测开发模式将根入口转到烟测工作台', () => {
  const root = (production, smoke) =>
    module.exports
      .getDocsRoutes({ production, smoke })
      .find((r) => r.path === '/');
  assert.equal(root(false, true).redirect, '/dev/smoke-test');
  assert.equal(root(false, false).redirect, undefined);
  assert.equal(root(true, true).redirect, undefined);
  assert.ok(root(false, false).component.endsWith('index.md'));
});
