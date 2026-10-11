import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const out = await build({
  entryPoints: ['apps/docs/src/smoke/config.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { initialConfig, changeView, redact } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(out.outputFiles[0].text).toString('base64')
);
test('修改主题保留 Office 插件身份且日志去敏', () => {
  const next = changeView(initialConfig, { theme: 'dark' });
  assert.equal(next.office, initialConfig.office);
  assert.equal(next.viewer.theme, 'dark');
  assert.equal(redact('token=secret').includes('secret'), false);
});
