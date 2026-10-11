import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packages = ['core', 'dom', 'office', 'react', 'vue', 'vue2', 'viewer'];

test('七个公开包都声明可解析的根入口和类型入口', async () => {
  for (const name of packages) {
    const manifest = JSON.parse(
      await readFile(`packages/${name}/package.json`, 'utf8'),
    );
    const root = manifest.exports['.'];
    assert.equal(typeof root.import, 'string', name);
    assert.equal(typeof root.types, 'string', name);
    await readFile(`packages/${name}/${root.import}`, 'utf8');
    await readFile(`packages/${name}/${root.types}`, 'utf8');
  }
});

test('独立消费者脚本直接覆盖 core 和 viewer 入口', async () => {
  const source = await readFile('scripts/testing/check-consumers.mjs', 'utf8');
  assert.match(source, /@fivo\/core/);
  assert.match(source, /@fivo\/viewer/);
});
