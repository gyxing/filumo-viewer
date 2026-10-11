import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessCompletion, sourceDigest } from './evidence.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--technical'))
  throw new Error('只支持 --technical；用户验收不由脚本代填。');
const read = async (file) => {
  try {
    return JSON.parse(await readFile(resolve(root, file), 'utf8'));
  } catch {
    return undefined;
  }
};
const result = assessCompletion({
  digest: await sourceDigest(root),
  consumers: await read('tmp/testing/consumers.json'),
  publicRun: await read('tmp/testing/public/run-summary.json'),
  localRun: await read('tmp/testing/local/run-summary.json'),
  formats: await read('tmp/testing/local/format-observations.json'),
  baseline: await read('tmp/testing/local/baseline.json'),
});
await mkdir(resolve(root, 'tmp/testing'), { recursive: true });
await writeFile(
  resolve(root, 'tmp/testing/acceptance.json'),
  JSON.stringify({ date: new Date().toISOString(), ...result }, null, 2),
);
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.technicalComplete
  ? args.includes('--technical')
    ? 0
    : 2
  : 1;
