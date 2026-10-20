import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { WORKSPACE_PACKAGES } from '../../scripts/workspace-packages.js';
import {
  preparePackageMetadata,
  readPackageMetadata,
} from '../../scripts/build/metadata.mjs';

test('DOM 和 Office 元数据分别来自所属包，重复准备不改文件', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fivo-metadata-'));
  for (const { name } of WORKSPACE_PACKAGES.filter(
    (item) => item.name === 'dom' || item.scopedStyles,
  )) {
    const version =
      name === 'dom' ? '1.2.0' : name === 'office' ? '2.3.0-next.1' : '1.0.0';
    await mkdir(join(root, 'packages', name, 'src'), { recursive: true });
    await writeFile(
      join(root, 'packages', name, 'package.json'),
      JSON.stringify({ name: '@fivo/' + name, version }),
    );
  }
  await preparePackageMetadata(root);
  const file = join(root, 'packages/office/src/generated/package.ts');
  const before = await stat(file);
  assert.ok(
    (await readFile(file, 'utf8')).includes('fivo-office-v2-3-0-next-1'),
  );
  assert.equal(
    (await readPackageMetadata(join(root, 'packages/dom'))).version,
    '1.2.0',
  );
  await preparePackageMetadata(root);
  assert.equal((await stat(file)).mtimeMs, before.mtimeMs);
  await writeFile(
    join(root, 'packages/office/package.json'),
    JSON.stringify({ name: '@fivo/office', version: '2.4.0' }),
  );
  await preparePackageMetadata(root);
  assert.ok((await readFile(file, 'utf8')).includes('fivo-office-v2-4-0'));
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
  const root = await mkdtemp(join(tmpdir(), 'fivo-style-build-'));
  await writeFile(join(root, 'sample.less'), 'p { color: red; }');
  const metadata = {
    name: '@fivo/office',
    group: 'office',
    version: '4.2.0',
    styleScope: 'fivo-office-v4-2-0',
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
  assert.ok([...styles.values()][0].includes('.fivo-office-v4-2-0 p'));
  assert.ok(result.outputFiles[0].text.includes('office:4.2.0:'));
});
