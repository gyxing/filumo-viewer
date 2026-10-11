import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCleanupPlan } from '../../scripts/checks/cleanup-inventory.mjs';
test('清单拒绝重复目标、未知归属、哈希漂移和越界恢复位置', () => {
  const item = {
    source: 'src/a.ts',
    target: 'packages/a.ts',
    action: 'move',
    owner: 'cleanup',
    sha256: 'a'.repeat(64),
    actualSha256: 'a'.repeat(64),
    backupVerified: true,
  };
  const base = { root: 'D:/repo', recoveryRoot: 'D:/recovery', files: [item] };
  assert.deepEqual(validateCleanupPlan(base), []);
  for (const change of [
    (b) => b.files.push({ ...item, source: 'src/b.ts' }),
    (b) => (b.files[0].owner = 'unknown'),
    (b) => (b.files[0].actualSha256 = 'b'.repeat(64)),
    (b) => (b.recoveryRoot = 'D:/repo/src/backup'),
    (b) => (b.files[0].target = '../outside'),
    (b) => (b.files[0].linked = true),
  ]) {
    const b = structuredClone(base);
    change(b);
    assert.ok(validateCleanupPlan(b).length);
  }
});
