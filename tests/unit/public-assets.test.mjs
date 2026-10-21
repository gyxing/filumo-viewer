import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
test('生产文档不包含本机烟测接口及样本清单', async () => {
  const files = await readdir('apps/docs/dist');
  assert.ok(files.includes('index.html'));
  for (const name of files.filter((n) => /\.(js|html)$/.test(n))) {
    const text = await readFile(join('apps/docs/dist', name), 'utf8');
    assert.equal(text.includes('__filumo_smoke/files/'), false);
    assert.equal(text.includes('本机样本已配置'), false);
  }
});
