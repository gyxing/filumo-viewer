import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import semver from 'semver';
import { WORKSPACE_PACKAGES } from '../../scripts/workspace-packages.js';
import {
  preparePackageMetadata,
  readPackageMetadata,
} from '../../scripts/build/metadata.mjs';

test('正式包使用 Filumo 作用域及各自合法版本，包间引用不混用旧名称', async () => {
  const names = new Set();
  for (const { name } of WORKSPACE_PACKAGES) {
    const manifest = JSON.parse(
      await readFile(join('packages', name, 'package.json'), 'utf8'),
    );
    assert.equal(manifest.name, '@filumo/' + name);
    assert.equal(semver.valid(manifest.version), manifest.version);
    const metadata = await readPackageMetadata(join('packages', name));
    assert.equal(metadata.version, manifest.version);
    assert.equal(names.has(manifest.name), false);
    names.add(manifest.name);
    for (const section of [
      'dependencies',
      'peerDependencies',
      'optionalDependencies',
    ])
      for (const [dependency, version] of Object.entries(
        manifest[section] ?? {},
      ))
        if (version.startsWith('workspace:'))
          assert.equal(dependency.startsWith('@filumo/'), true);
  }
  assert.equal(names.size, 15);
});

test('DOM 和 Office 元数据分别来自所属包，重复准备不改文件', async () => {
  const root = await mkdtemp(join(tmpdir(), 'filumo-metadata-'));
  // 临时工作区只验证版本元数据；PDF 资源准备需要真实安装的发行依赖。
  const metadataNames = WORKSPACE_PACKAGES.filter(
    (item) => (item.name === 'dom' || item.scopedStyles) && item.name !== 'pdf',
  ).map((item) => item.name);
  for (const { name } of WORKSPACE_PACKAGES.filter(
    (item) => item.name === 'dom' || item.scopedStyles,
  )) {
    const version =
      name === 'dom' ? '1.2.0' : name === 'office' ? '2.3.0-next.1' : '1.0.0';
    await mkdir(join(root, 'packages', name, 'src'), { recursive: true });
    await writeFile(
      join(root, 'packages', name, 'package.json'),
      JSON.stringify({ name: '@filumo/' + name, version }),
    );
  }
  await preparePackageMetadata(root, metadataNames);
  const file = join(root, 'packages/office/src/generated/package.ts');
  const before = await stat(file);
  assert.ok(
    (await readFile(file, 'utf8')).includes('filumo-office-v2-3-0-next-1'),
  );
  assert.equal(
    (await readPackageMetadata(join(root, 'packages/dom'))).version,
    '1.2.0',
  );
  await preparePackageMetadata(root, metadataNames);
  assert.equal((await stat(file)).mtimeMs, before.mtimeMs);
  await writeFile(
    join(root, 'packages/office/package.json'),
    JSON.stringify({ name: '@filumo/office', version: '2.4.0' }),
  );
  await preparePackageMetadata(root, metadataNames);
  assert.ok((await readFile(file, 'utf8')).includes('filumo-office-v2-4-0'));
  assert.ok(
    (
      await readFile(
        join(root, 'packages/dom/src/generated/package.ts'),
        'utf8',
      )
    ).includes('1.2.0'),
  );
  await assert.rejects(preparePackageMetadata(root, ['../outside']), /包/);
});

import { build } from 'esbuild';
import { stylePlugin } from '../../scripts/build/styles.mjs';
test('相同包元数据同时驱动 CSS 作用域和注册版本，不向宿主输出 Less', async () => {
  const root = await mkdtemp(join(tmpdir(), 'filumo-style-build-'));
  await writeFile(join(root, 'sample.less'), 'p { color: red; }');
  const metadata = {
    name: '@filumo/office',
    group: 'office',
    version: '4.2.0',
    styleScope: 'filumo-office-v4-2-0',
  };
  const styles = new Map();
  const result = await build({
    absWorkingDir: root,
    entryPoints: [join(root, 'sample.less')],
    bundle: true,
    write: false,
    format: 'esm',
    packages: 'external',
    plugins: [stylePlugin(metadata, styles, root)],
  });
  assert.ok([...styles.values()][0].includes('.filumo-office-v4-2-0 p'));
  assert.ok(result.outputFiles[0].text.includes('office:4.2.0:'));
});

test('DOM 根目录和嵌套目录的样式使用同一个包内注册运行时', async () => {
  const root = await mkdtemp(join(tmpdir(), 'filumo-dom-style-build-'));
  const source = join(root, 'packages/dom/src');
  await mkdir(join(source, 'shell/nested'), { recursive: true });
  // 最小运行时记录真实打包后的注册调用，避免只检查编译字符串而遗漏模块解析。
  await writeFile(
    join(source, 'styles.ts'),
    'export const registrations = []; export function registerStyle(...args) { registrations.push(args); }',
  );
  await writeFile(join(source, 'sample.less'), '.root { color: red; }');
  await writeFile(
    join(source, 'shell/nested/sample.less'),
    '.nested { color: blue; }',
  );
  await writeFile(
    join(source, 'index.ts'),
    "import './sample.less'; import './shell/nested/sample.less'; export { registrations } from './styles';",
  );
  const styles = new Map();
  const result = await build({
    absWorkingDir: root,
    entryPoints: [join(source, 'index.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    plugins: [stylePlugin({ group: 'dom', version: '0.1.0' }, styles, root)],
  });
  const { registrations } = await import(
    'data:text/javascript;base64,' +
      Buffer.from(result.outputFiles[0].text).toString('base64')
  );
  assert.equal(registrations.length, 2);
  for (const [group, id] of registrations) {
    assert.equal(group, 'dom');
    assert.match(id, /^dom:0\.1\.0:/);
  }
  assert.deepEqual(
    registrations.map((entry) => entry[2]).sort(),
    [...styles.values()].sort(),
  );
  assert.ok(styles.has('packages/dom/src/sample.less'));
  assert.ok(styles.has('packages/dom/src/shell/nested/sample.less'));
});

test('真实 DOM 网格入口可打包子目录提示样式且保留公共导出', async () => {
  const root = process.cwd();
  const styles = new Map();
  const result = await build({
    absWorkingDir: root,
    entryPoints: [join(root, 'packages/dom/src/grid.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    packages: 'external',
    metafile: true,
    plugins: [
      stylePlugin(
        await readPackageMetadata(join(root, 'packages/dom')),
        styles,
        root,
      ),
    ],
  });
  assert.ok(styles.has('packages/dom/src/grid.less'));
  assert.ok(styles.has('packages/dom/src/shell/reading-notice.less'));
  const output = Object.values(result.metafile.outputs)[0];
  assert.ok(output.exports.includes('GridInteractionController'));
  assert.ok(output.exports.includes('createGridNotice'));
  assert.equal(output.imports.length, 0);
});
