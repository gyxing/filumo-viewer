import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  packPackages,
  readPackedOutput,
  verifyPackedFile,
} from '../../scripts/testing/pack-packages.mjs';
test('打包记录使用 CLI 实际 filename，拒绝错包、缺文件与哈希漂移', async () => {
  const root = await mkdtemp(join(tmpdir(), 'filumo-pack-'));
  const file = join(root, 'arbitrary-output.tgz');
  await writeFile(file, 'bytes');
  const metadata = { name: '@filumo/demo', version: '3.1.0' };
  const record = await readPackedOutput(
    JSON.stringify({
      ...metadata,
      filename: file,
      files: [{ path: 'package.json' }],
    }),
    metadata,
    root,
  );
  assert.equal(record.file, file);
  await verifyPackedFile(record);
  for (const data of [
    { ...metadata, filename: join(root, 'absent.tgz') },
    { ...metadata, name: '@filumo/other', filename: file },
    { ...metadata, filename: join(root, '../outside.tgz') },
    [metadata],
  ])
    await assert.rejects(
      readPackedOutput(JSON.stringify(data), metadata, root),
    );
  await writeFile(file, 'changed');
  await assert.rejects(verifyPackedFile(record), /哈希/);
});
test('真实 pnpm pack 禁用 prepack 脚本，记录声明版本而非固定版本', async () => {
  const root = await mkdtemp(join(tmpdir(), 'filumo-pack-real-'));
  await mkdir(join(root, 'packages/demo'), { recursive: true });
  await writeFile(
    join(root, 'packages/demo/package.json'),
    JSON.stringify({
      name: '@filumo/demo',
      version: '3.2.1',
      scripts: { prepack: 'node -e "throw new Error(123)"' },
    }),
  );
  const records = await packPackages(root, join(root, 'out'), ['demo']);
  assert.equal(records['@filumo/demo'].version, '3.2.1');
  await verifyPackedFile(records['@filumo/demo']);
});
