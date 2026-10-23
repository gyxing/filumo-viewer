import { lstat, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runPnpm } from '../testing/package-manager.mjs';
import { loadReleasePackages, readUtf8 } from './workspace.mjs';

/** 尚未应用的版本记录不能被真实发布入口忽略；首次没有记录时保持 0.1.0。 */
export async function hasPendingChangesets(root) {
  const files = await readdir(join(root, '.changeset'));
  return files.some(
    (file) => file.endsWith('.md') && file.toLowerCase() !== 'readme.md',
  );
}

/** 升版交给 Changesets，只同步变化包的说明和锁文件，不操作 Git 或发布。 */
export async function versionPackages(root, { run = runPnpm } = {}) {
  if (!(await hasPendingChangesets(root))) return [];
  const before = await loadReleasePackages(root);
  const readmes = new Map();
  for (const pkg of before.values()) {
    const file = join(root, 'packages', pkg.directory, 'README.md');
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink())
      throw Error('README 不能为链接：' + pkg.name);
    const text = await readUtf8(file);
    const marker = '本文档对应 **' + pkg.version + '**';
    if (text.split(marker).length !== 2)
      throw Error('README 当前版本标记缺失或重复：' + pkg.name);
    readmes.set(pkg.name, { file, text, marker });
  }
  const options = {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, HUSKY: '0' },
  };
  try {
    await run(['exec', 'changeset', 'version'], options);
    const after = await loadReleasePackages(root);
    const changed = [...after.values()].filter(
      (pkg) => pkg.version !== before.get(pkg.name).version,
    );
    for (const pkg of changed) {
      const { file, text, marker } = readmes.get(pkg.name);
      if ((await readUtf8(file)) !== text)
        throw Error('升版期间 README 已变化，拒绝覆盖：' + pkg.name);
      await writeFile(
        file,
        text.replace(marker, '本文档对应 **' + pkg.version + '**'),
        'utf8',
      );
    }
    await run(
      [
        'install',
        '--lockfile-only',
        '--ignore-scripts',
        '--no-frozen-lockfile',
      ],
      options,
    );
    return changed.map((pkg) => ({
      name: pkg.name,
      oldVersion: before.get(pkg.name).version,
      version: pkg.version,
    }));
  } catch {
    throw Error(
      '升版或锁文件更新未完成；请审阅 package.json、CHANGELOG、README 与锁文件的实际差异后重试，工具没有提交或回滚 Git',
    );
  }
}
