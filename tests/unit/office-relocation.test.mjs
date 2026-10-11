import assert from 'node:assert/strict';
import test from 'node:test';
import { auditOffice } from '../../scripts/checks/office-boundaries.mjs';
test('Office 和 Worker 联合图无旧路径和框架依赖', async () => {
  const result = await auditOffice();
  assert.deepEqual(result.violations, []);
  assert.ok(result.graphs.worker.files > 0);
});
