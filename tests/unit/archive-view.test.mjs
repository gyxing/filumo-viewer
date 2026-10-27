import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
test('归档复用公共树和分栏，列表按可见范围绘制且不反向依赖 Viewer', async () => {
  const tree = await readFile(
      'packages/archive/src/view/ArchiveTree.ts',
      'utf8',
    ),
    list = await readFile('packages/archive/src/view/ArchiveList.ts', 'utf8'),
    preview = await readFile(
      'packages/archive/src/view/EntryPreview.ts',
      'utf8',
    );
  assert.match(tree, /@filumo\/dom\/outline/);
  assert.match(list, /scrollTop/);
  assert.match(list, /begin/);
  assert.match(preview, /createChildViewer/);
  assert.doesNotMatch(preview, /@filumo\/viewer/);
});
