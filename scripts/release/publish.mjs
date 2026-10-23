import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { packPackages, verifyPackedFile } from '../testing/pack-packages.mjs';
import { runPnpm } from '../testing/package-manager.mjs';
import {
  validateBuildArtifacts,
  readPackedManifest,
  validatePackedManifest,
} from './artifacts.mjs';
import { createReleasePlan } from './plan.mjs';
import { NPM_REGISTRY, readRegistryVersions } from './registry.mjs';
import { loadReleasePackages } from './workspace.mjs';
import { hasPendingChangesets } from './version.mjs';

/** 真实发布必须在 master 且工作区干净，pnpm 还会保留自身的远程同步检查。 */
export function checkReleaseGit(root, readGit) {
  const git =
    readGit ??
    ((args) =>
      execFileSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim());
  if (git(['branch', '--show-current']) !== 'master')
    throw Error('真实发布仅允许 master 分支；其他分支请使用 release:plan');
  if (git(['status', '--porcelain']))
    throw Error(
      '工作区未干净，请先审阅并处理本地修改；发布工具不会清理或提交文件',
    );
}

/** 所有产物核验后才开始写 registry，失败保留准确进度供重新查询后重试。 */
export async function publishRelease(root, selected, adapters = {}) {
  await (adapters.checkGit ?? checkReleaseGit)(root);
  if (await hasPendingChangesets(root))
    throw Error(
      '仍有未应用的 Changeset，请先运行 release:version 并完成构建验证和版本提交',
    );
  const packages = await loadReleasePackages(root);
  const getVersions =
    adapters.getVersions ?? ((name) => readRegistryVersions(name, { root }));
  const plan = await createReleasePlan(packages, selected, getVersions);
  if (plan.errors.length)
    throw Error(plan.errors.map((error) => error.message).join('\n'));
  if (!plan.order.length)
    return { published: [], remaining: [], skipped: selected };
  for (const name of plan.order)
    await validateBuildArtifacts(root, packages.get(name));
  const temp = resolve(root, 'tmp');
  const info = await lstat(temp).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (
    info &&
    (!info.isDirectory() ||
      info.isSymbolicLink() ||
      (await realpath(temp)) !== temp)
  )
    throw Error('发布临时目录不能为链接');
  await mkdir(temp, { recursive: true });
  const output = await mkdtemp(join(temp, 'release-'));
  const records = await (adapters.pack ?? packPackages)(
    root,
    output,
    plan.order.map((name) => packages.get(name).directory),
  );
  for (const name of plan.order) {
    const record = records[name];
    if (record?.name !== name || record.version !== packages.get(name).version)
      throw Error('打包记录不符：' + name);
    await verifyPackedFile(record);
    validatePackedManifest(
      await readPackedManifest(record.file),
      packages.get(name),
      packages,
    );
  }
  const report = {
    published: [],
    failed: null,
    remaining: [...plan.order],
    skipped: selected.filter((name) => !plan.order.includes(name)),
    file: join(output, 'result.json'),
  };
  const save = () =>
    writeFile(report.file, JSON.stringify(report, null, 2) + '\n', 'utf8');
  await save();
  for (const name of plan.order) {
    try {
      const record = records[name];
      await verifyPackedFile(record);
      // 发布已经核验的 tarball，避免二次打包或生命周期改变产物。
      const args = [
        'publish',
        record.file,
        '--access=public',
        '--tag=latest',
        '--publish-branch=master',
        '--registry=' + NPM_REGISTRY,
        '--config.@filumo:registry=' + NPM_REGISTRY,
        '--config.ignore-scripts=true',
        '--config.git-checks=true',
      ];
      if (adapters.publish) await adapters.publish(record, args);
      else
        runPnpm(args, {
          cwd: root,
          stdio: 'inherit',
          env: { ...process.env, HUSKY: '0' },
        });
      report.published.push(name);
      report.remaining.shift();
      await save();
    } catch {
      report.failed = name;
      await save();
      const error = Error(
        '发布未全部完成；失败请求可能已被 npm 接受，请重新查询 registry 后重试。记录：' +
          report.file,
      );
      error.report = report;
      throw error;
    }
  }
  return report;
}
