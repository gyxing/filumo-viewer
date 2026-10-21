import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
test('工作区只暴露新命令，文档应用私有且无旧兼容导出', async () => {
  const root = JSON.parse(await readFile('package.json', 'utf8')),
    docs = JSON.parse(await readFile('apps/docs/package.json', 'utf8'));
  assert.equal(root.name, 'filumo-workspace');
  assert.equal(root.private, true);
  for (const key of ['exports', 'module', 'types', 'peerDependencies'])
    assert.equal(root[key], undefined);
  assert.equal(
    Object.keys(root.scripts).some((k) => k.startsWith('filumo:')),
    false,
  );
  assert.equal(docs.private, true);
  assert.ok(docs.dependencies['@filumo/office']);
  assert.equal(root.devDependencies.father, undefined);
});
