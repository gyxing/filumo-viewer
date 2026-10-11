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
