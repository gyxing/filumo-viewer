import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePackageMetadata } from '../build/metadata.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
await preparePackageMetadata(root);
if (process.argv.length > 2) throw Error('未知参数');
const files = readdirSync(resolve(root, 'tests/unit'))
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()
  .map((f) => 'tests/unit/' + f);
if (!files.length) throw Error('无测试');
const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
process.exitCode = result.status ?? 1;
