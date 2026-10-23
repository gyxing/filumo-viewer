import semver from 'semver';
import { resolveBuildOrder } from '../build/build-order.mjs';
import { internalDependencies } from './workspace.mjs';

/** 纯只读规划：不打包、不写版本，不把必要依赖静默加入选择范围。 */
export async function createReleasePlan(packages, selected, getVersions) {
  const cache = new Map();
  const versionsOf = async (name) => {
    if (!cache.has(name)) {
      const versions = await getVersions(name);
      if (
        !Array.isArray(versions) ||
        versions.some((value) => !semver.valid(value))
      )
        throw Error('registry 版本数据无效：' + name);
      cache.set(name, versions);
    }
    return cache.get(name);
  };
  const rows = [];
  for (const name of selected) {
    const pkg = packages.get(name);
    if (!pkg) throw Error('未知发布目标：' + name);
    const versions = await versionsOf(name);
    rows.push({
      name,
      directory: pkg.directory,
      version: pkg.version,
      registryVersions: versions,
      status: versions.includes(pkg.version) ? 'published' : 'pending',
      dependencies: internalDependencies(pkg, packages),
    });
  }
  const pending = new Set(
    rows.filter((row) => row.status === 'pending').map((row) => row.name),
  );
  const required = new Set();
  const errors = [];
  const checked = new Set();
  const inspect = async (name) => {
    if (checked.has(name)) return;
    checked.add(name);
    const pkg = packages.get(name);
    const existing = await versionsOf(name);
    if (existing.some((version) => semver.gt(version, pkg.version)))
      errors.push({
        code: 'OLDER_VERSION',
        package: name,
        message: name + ' 的本地版本低于 registry 已有版本，请先确认版本基线',
      });
    for (const edge of internalDependencies(pkg, packages)) {
      const versions = await versionsOf(edge.name);
      if (versions.some((version) => semver.satisfies(version, edge.range)))
        continue;
      const target = packages.get(edge.name);
      if (
        pending.has(edge.name) &&
        semver.satisfies(target.version, edge.range)
      )
        continue;
      required.add(edge.name);
      errors.push({
        code: 'MISSING_DEPENDENCY',
        package: name,
        dependency: edge.name,
        message:
          name +
          ' 需要 ' +
          edge.name +
          '@' +
          edge.range +
          '；npm 没有可用版本，本次清单也未提供兼容版本',
      });
      if (
        !pending.has(edge.name) &&
        semver.satisfies(target.version, edge.range)
      )
        await inspect(edge.name);
    }
  };
  for (const name of pending) await inspect(name);
  const manifests = Object.fromEntries(
    [...packages.values()].map((pkg) => [pkg.directory, pkg]),
  );
  const order = resolveBuildOrder(
    [...pending].map((name) => packages.get(name).directory),
    manifests,
  )
    .map((directory) => '@filumo/' + directory)
    .filter((name) => pending.has(name));
  return { rows, order, required: [...required], errors };
}
