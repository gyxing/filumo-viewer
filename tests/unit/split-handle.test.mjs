import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
test('公共分隔条保持模型中立，JSON 只适配宽度回调', async () => {
  const source = await readFile(
    'packages/dom/src/split/SplitHandle.ts',
    'utf8',
  );
  assert.doesNotMatch(source, /fivo-json|fivo-xml/);
  assert.match(source, /onResize/);
  const adapter = await readFile(
    'packages/json/src/view/JsonSplitHandle.ts',
    'utf8',
  );
  assert.match(adapter, /@fivo\/dom\/split/);
  assert.match(adapter, /fivo-json-tree-width/);
});
