import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runPnpm } from './package-manager.mjs';

/** 首次解析依赖后冻结复装，锁漂移或安装失败均不得生成通过记录。 */
export async function installFrozenConsumer(
  directory,
  execute = (args) =>
    runPnpm(args, {
      cwd: directory,
      env: { ...process.env, HUSKY: '0' },
      stdio: 'pipe',
    }),
) {
  await execute(['install', '--ignore-scripts', '--no-frozen-lockfile']);
  const before = await readFile(join(directory, 'pnpm-lock.yaml'));
  await execute(['install', '--ignore-scripts', '--frozen-lockfile']);
  const after = await readFile(join(directory, 'pnpm-lock.yaml'));
  if (!before.equals(after)) throw new Error('冻结复装改变了独立消费者锁文件');
  return {
    frozenInstall: 'passed',
    lockSha256: createHash('sha256').update(after).digest('hex'),
  };
}
