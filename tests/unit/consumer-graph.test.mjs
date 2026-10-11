import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { auditConsumerGraph } from '../../scripts/testing/consumer-graph.mjs';
const root = resolve('isolated/node_modules/@fivo/office').replaceAll(
  '\\',
  '/',
);
const roles = {
  driver: ['parts/arbitrary.js'],
  selector: ['parts/select.js'],
  word: ['parts/word.js'],
  spreadsheet: ['parts/sheet.js'],
  presentation: ['parts/slides.js'],
};
function fixture() {
  const bundle = {
    entry: {
      type: 'chunk',
      fileName: 'entry',
      isEntry: true,
      imports: [],
      modules: { [root + '/dist/index.js']: {} },
    },
  };
  for (const [role, outputs] of Object.entries(roles))
    bundle[role] = {
      type: 'chunk',
      fileName: role,
      imports: [],
      modules: { [root + '/dist/' + outputs[0]]: {} },
    };
  return bundle;
}
test('依赖图按角色映射识别任意 chunk 名称，共享或重导出提前加载均失败', () => {
  const manifest = { schemaVersion: 2, roles };
  assert.equal(
    auditConsumerGraph(fixture(), root, manifest).violations.length,
    0,
  );
  const initial = fixture();
  initial.entry.imports = ['driver'];
  assert.ok(auditConsumerGraph(initial, root, manifest).violations.length);
  const shared = fixture();
  shared.entry.modules[root + '/dist/parts/arbitrary.js'] = {};
  assert.ok(auditConsumerGraph(shared, root, manifest).violations.length);
  const missing = fixture();
  delete missing.word;
  assert.ok(auditConsumerGraph(missing, root, manifest).violations.length);
  assert.throws(
    () => auditConsumerGraph(fixture(), root, { schemaVersion: 2, roles: {} }),
    /角色/,
  );
});
