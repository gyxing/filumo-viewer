import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceDigest } from '../checks/evidence.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const local = args.includes('--local');
// 本机文档报告与公开 CI 报告分目录，防止误上传真实样本内容。
const env = { ...process.env, FIVO_LOCAL_SAMPLES: local ? '1' : '0' };
const digest = await sourceDigest(root);
const result = spawnSync(
  process.execPath,
  [
    require.resolve('@playwright/test/cli'),
    'test',
    '--config',
    resolve(root, 'tests/browser/playwright.config.mjs'),
    ...args.filter((arg) => arg !== '--local'),
  ],
  { cwd: root, env, stdio: 'inherit', windowsHide: true },
);
if (result.error) console.error(result.error.message);
const exitCode = result.status ?? 1;
const output = resolve(root, 'tmp/testing/' + (local ? 'local' : 'public'));
await mkdir(output, { recursive: true });
let raw;
try {
  raw = JSON.parse(await readFile(resolve(output, 'results.json'), 'utf8'));
} catch {
  /* 缺少原始报告保持失败，不能用空结果代替。 */
}
const tests = [];
function collect(suites = []) {
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? [])
        tests.push({
          title: spec.title,
          status: test.results?.at(-1)?.status ?? 'missing',
        });
    }
    collect(suite.suites);
  }
}
collect(raw?.suites);
const summary = {
  date: new Date().toISOString(),
  command: ['test:browser', ...args],
  sourceDigest: digest,
  sourceUnchanged: digest === (await sourceDigest(root)),
  exitCode,
  passed: raw?.stats?.expected ?? 0,
  failed: (raw?.stats?.unexpected ?? 0) + (raw?.errors?.length ?? 0),
  skipped: raw?.stats?.skipped ?? 0,
  tests,
  rawReport: 'results.json',
};
await writeFile(
  resolve(output, 'run-summary.json'),
  JSON.stringify(summary, null, 2),
);
process.exitCode = !summary.sourceUnchanged || !raw ? 1 : exitCode;
