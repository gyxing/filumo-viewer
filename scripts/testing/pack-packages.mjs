import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { readPackageMetadata } from '../build/metadata.mjs';
import { WORKSPACE_PACKAGES } from '../workspace-packages.js';
import { runPnpm } from './package-manager.mjs';

/** 固定 pnpm 11 的 --json 输出字段为 name/version/filename，不推测 tgz 名称。 */
export async function readPackedOutput(output, metadata, outputRoot) {
  const value = JSON.parse(output);
  if (
    !value ||
    Array.isArray(value) ||
    value.name !== metadata.name ||
    value.version !== metadata.version ||
    typeof value.filename !== 'string' ||
    !Array.isArray(value.files) ||
    !value.files.some((f) => f.path === 'package.json')
  )
    throw Error('打包记录与包元数据不一致');
  const base = await realpath(outputRoot),
    file = resolve(base, value.filename),
    rel = relative(base, file);
  if (!rel || rel.startsWith('..') || isAbsolute(rel))
    throw Error('打包路径越界');
  if (
    (await lstat(file)).isSymbolicLink() ||
    !(await lstat(file)).isFile() ||
    (await realpath(file)) !== file
  )
    throw Error('打包结果不是受控普通文件');
  return {
    name: value.name,
    version: value.version,
    file,
    sha256: createHash('sha256')
      .update(await readFile(file))
      .digest('hex'),
  };
}

/** 两种消费流程复用同批产物，过期或被替换的 tgz 不能使用。 */
export async function verifyPackedFile(record) {
  if (
    !record ||
    typeof record.file !== 'string' ||
    typeof record.sha256 !== 'string'
  )
    throw Error('缺少打包记录');
  if (
    createHash('sha256')
      .update(await readFile(record.file))
      .digest('hex') !== record.sha256
  )
    throw Error('打包文件哈希不符');
  return record.file;
}

/** 每包使用空输出目录，只打包不发布，明确关闭生命周期脚本。 */
export async function packPackages(
  root,
  outputRoot,
  names = WORKSPACE_PACKAGES.map((item) => item.name),
) {
  const records = {};
  for (const name of names) {
    if (!/^[a-z0-9-]+$/.test(name)) throw Error('非法包名');
    const directory = join(root, 'packages', name),
      metadata = await readPackageMetadata(directory);
    if (records[metadata.name]) throw Error('重复打包目标');
    const output = join(outputRoot, name);
    await mkdir(output, { recursive: true });
    if ((await readdir(output)).length) throw Error('打包目录必须为空');
    const result = runPnpm(
      [
        'pack',
        '--json',
        '--config.ignore-scripts=true',
        '--pack-destination',
        output,
      ],
      {
        cwd: directory,
        env: { ...process.env, HUSKY: '0' },
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );
    records[metadata.name] = await readPackedOutput(
      String(result),
      metadata,
      output,
    );
  }
  return records;
}

/** 安装完成后再核对包身份与 workspace 协议，不让根依赖提升掩盖错包。 */
export async function verifyInstalledPackages(directory, records) {
  const rootFile = join(directory, 'package.json');
  const roots = JSON.parse(await readFile(rootFile, 'utf8'));
  const queue = Object.keys(roots.dependencies ?? {})
    .filter((name) => name.startsWith('@fivo/'))
    .map((name) => ({ name, issuer: rootFile }));
  const visited = new Set();
  while (queue.length) {
    const { name, issuer } = queue.shift(),
      file = createRequire(issuer).resolve(name + '/package.json');
    if (visited.has(file)) continue;
    visited.add(file);
    const manifest = JSON.parse(await readFile(file, 'utf8')),
      record = records[name];
    if (
      !record ||
      manifest.name !== record.name ||
      manifest.version !== record.version
    )
      throw Error('安装的包不是本次产物：' + name);
    for (const [dep, range] of Object.entries({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
      ...manifest.optionalDependencies,
    })) {
      if (
        typeof range === 'string' &&
        (/^(workspace:|file:|link:)/.test(range) || isAbsolute(range))
      )
        throw Error('生产依赖残留工作区路径：' + name);
      if (dep.startsWith('@fivo/') && manifest.dependencies?.[dep])
        queue.push({ name: dep, issuer: file });
    }
  }
}
