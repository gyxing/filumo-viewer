import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import semver from 'semver';
import { WORKSPACE_PACKAGES } from '../workspace-packages.js';

/** 发布与升版都严格读取 UTF-8，避免把损坏字符写回 manifest 或说明。 */
export async function readUtf8(file) {
  return new TextDecoder('utf-8', { fatal: true }).decode(await readFile(file));
}

/** 从唯一正式包注册表读取身份，拒绝私有包、链接和无效版本。 */
export async function loadReleasePackages(root) {
  const packagesRoot = await realpath(join(root, 'packages'));
  const packages = new Map();
  for (const { name } of WORKSPACE_PACKAGES) {
    const path = join(packagesRoot, name);
    if (
      (await lstat(path)).isSymbolicLink() ||
      dirname(await realpath(path)) !== packagesRoot
    )
      throw Error('发布包目录越界：' + name);
    const file = join(path, 'package.json');
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink())
      throw Error('发布 manifest 不能为链接：' + name);
    const manifest = JSON.parse(await readUtf8(file));
    if (
      manifest.name !== '@filumo/' + name ||
      manifest.private ||
      !semver.valid(manifest.version)
    )
      throw Error('无效正式发布包：' + name);
    if (
      manifest.publishConfig?.access !== 'public' ||
      manifest.publishConfig?.directory ||
      manifest.publishConfig?.registry
    )
      throw Error('发布目标必须使用本包目录和统一 public registry：' + name);
    packages.set(manifest.name, { ...manifest, directory: name });
  }
  return packages;
}

/** 发布必须明确指定正式包或 --all，禁止把路径或任意过滤表达式传给 pnpm。 */
export function selectReleasePackages(args, packages) {
  if (args.length === 1 && args[0] === '--all') return [...packages.keys()];
  return [
    ...new Set(
      args.map((value) => {
        const name = value.startsWith('@filumo/') ? value : '@filumo/' + value;
        if (!packages.has(name))
          throw Error(
            '未知发布目标：' +
              value +
              '；请使用包目录名、完整包名或单独的 --all',
          );
        return name;
      }),
    ),
  ];
}

/** 对齐 pnpm 对 workspace 依赖的发布转换，语义范围由 semver 判断。 */
export function publishedRange(value, dependency) {
  if (typeof value !== 'string') throw Error('依赖范围必须是字符串');
  let range = value;
  if (range.startsWith('workspace:')) {
    range = range.slice('workspace:'.length);
    if (range === '*' || range === '') range = dependency.version;
    else if (range === '^' || range === '~') range += dependency.version;
  }
  if (!semver.validRange(range)) throw Error('不支持的发布依赖范围：' + value);
  return range;
}

/** 运行时、可选和 peer 内部依赖都参与发布兼容检查，开发依赖不进入消费者。 */
export function internalDependencies(pkg, packages) {
  const dependencies = [];
  for (const section of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    for (const [name, value] of Object.entries(pkg[section] ?? {})) {
      if (!name.startsWith('@filumo/')) continue;
      const dependency = packages.get(name);
      if (!dependency) throw Error('未注册的内部依赖：' + name);
      dependencies.push({
        section,
        name,
        range: publishedRange(value, dependency),
      });
    }
  }
  return dependencies;
}
