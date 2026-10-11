import assert from 'node:assert/strict';
import test from 'node:test';
import { validateReference } from '../../scripts/checks/reference-contract.mjs';
test('固定参考拒绝丢内容、单元格改变和几何漂移', () => {
  const ref = {
    text: '尾部',
    images: 1,
    tables: 1,
    cells: [{ ref: 'A1', text: 'a' }],
    width: 794,
  };
  assert.equal(validateReference(ref, ref).passed, true);
  for (const key of ['text', 'images', 'tables', 'cells', 'width']) {
    const bad = { ...ref, [key]: key === 'width' ? 795 : null };
    assert.equal(validateReference(bad, ref).passed, false);
  }
});
