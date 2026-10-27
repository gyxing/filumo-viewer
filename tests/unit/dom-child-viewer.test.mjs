import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
test('子查看器复用同一注册集合，Archive 无须依赖标准预设', async () => {
  const code = await readFile('packages/dom/src/createViewer.ts', 'utf8');
  assert.match(code, /createChildViewer/);
  assert.match(code, /plugins: options.plugins/);
  assert.match(code, /children/);
});
