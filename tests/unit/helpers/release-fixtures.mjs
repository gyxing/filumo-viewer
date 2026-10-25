import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { WORKSPACE_PACKAGES } from '../../../scripts/workspace-packages.js';

/** 复用真实包关系，固定的测试版本不限制仓库实际版本。 */
export function releasePackages(overrides = {}) {
  return new Map(
    WORKSPACE_PACKAGES.map(({ name }) => {
      const manifest = JSON.parse(
        readFileSync(
          new URL(
            '../../../packages/' + name + '/package.json',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      const pkg = {
        ...manifest,
        version: '0.1.0',
        directory: name,
        ...overrides[name],
      };
      return [pkg.name, pkg];
    }),
  );
}

/** 构造 pnpm 使用的普通 tar 头，仅放入测试 manifest，不调用真实 pack。 */
export function manifestArchive(manifest) {
  const data = Buffer.from(JSON.stringify(manifest));
  const header = Buffer.alloc(512);
  header.write('package/package.json');
  header.write('0000644\0', 100);
  header.write(data.length.toString(8).padStart(11, '0') + '\0', 124);
  header.fill(32, 148, 156);
  header[156] = 48;
  header.write('ustar\0', 257);
  const checksum = header.reduce((sum, value) => sum + value, 0);
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);
  return gzipSync(
    Buffer.concat([
      header,
      data,
      Buffer.alloc((512 - (data.length % 512)) % 512),
      Buffer.alloc(1024),
    ]),
  );
}

/** 在临时工作区准备有版本身份的最小产物，测试不接触实际 dist。 */
export async function releaseWorkspace(packages = releasePackages()) {
  const root = await mkdtemp(join(tmpdir(), 'filumo-release-'));
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'release-fixture',
      private: true,
      packageManager: 'pnpm@11.10.0',
    }),
  );
  await writeFile(
    join(root, 'pnpm-workspace.yaml'),
    'packages:\n  - packages/*\n',
  );
  await mkdir(join(root, '.changeset'));
  for (const pkg of packages.values()) {
    const directory = join(root, 'packages', pkg.directory);
    await mkdir(join(directory, 'dist'), { recursive: true });
    const { directory: _, ...manifest } = pkg;
    await writeFile(join(directory, 'package.json'), JSON.stringify(manifest));
    await writeFile(
      join(directory, 'README.md'),
      '# ' +
        pkg.name +
        '\n\nThis documentation covers **' +
        pkg.version +
        '**.\n',
    );
    await writeFile(
      join(directory, 'README.zh-CN.md'),
      '# ' + pkg.name + '\n\n本文档对应 **' + pkg.version + '**。\n',
    );
    await writeFile(join(directory, 'dist/index.js'), 'export {};');
    const exports = (value) =>
      typeof value === 'string'
        ? [value]
        : value && typeof value === 'object'
        ? Object.values(value).flatMap(exports)
        : [];
    for (const file of exports(pkg.exports).filter(
      (file) => file.startsWith('./dist/') && !file.includes('*'),
    )) {
      await mkdir(dirname(join(directory, file)), { recursive: true });
      await writeFile(join(directory, file), 'export {};');
    }
    await writeFile(
      join(directory, 'dist/build-manifest.json'),
      JSON.stringify({
        package: pkg.name,
        version: pkg.version,
        outputs: [{ file: 'index.js' }],
      }),
    );
  }
  return root;
}

/** 模拟 pack 输出和哈希，不执行生命周期或网络写入。 */
export function fakePack(packages, packedDependencies) {
  return async (root, output, names) => {
    await mkdir(output, { recursive: true });
    const records = {};
    for (const name of names) {
      const pkg = packages.get('@filumo/' + name);
      const file = join(output, name + '.tgz');
      const data = manifestArchive({
        name: pkg.name,
        version: pkg.version,
        dependencies:
          packedDependencies?.[name] ??
          Object.fromEntries(
            Object.entries(pkg.dependencies ?? {}).map(([dep, range]) => [
              dep,
              range === 'workspace:^' ? '^' + packages.get(dep).version : range,
            ]),
          ),
      });
      await writeFile(file, data);
      records[pkg.name] = {
        name: pkg.name,
        version: pkg.version,
        file,
        sha256: createHash('sha256').update(data).digest('hex'),
      };
    }
    return records;
  };
}
