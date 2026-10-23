import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { versionPackages } from '../../scripts/release/version.mjs';
import { releaseWorkspace } from './helpers/release-fixtures.mjs';

test('首次没有 Changeset 时不升级 0.1.0，也不执行外部命令', async () => {
  const root = await releaseWorkspace();
  assert.deepEqual(
    await versionPackages(root, { run: () => assert.fail('不应执行') }),
    [],
  );
});

test('仅同步升版包的 README，锁文件更新明确关闭生命周期，不提交 Git', async () => {
  const root = await releaseWorkspace();
  await writeFile(
    join(root, '.changeset/pdf-fix.md'),
    '---\n"@filumo/pdf": patch\n---\n修复 PDF。\n',
  );
  const calls = [];
  const changed = await versionPackages(root, {
    run: async (args) => {
      calls.push(args);
      if (args[0] === 'exec') {
        const file = join(root, 'packages/pdf/package.json');
        const pkg = JSON.parse(await readFile(file, 'utf8'));
        await writeFile(file, JSON.stringify({ ...pkg, version: '0.1.1' }));
      }
    },
  });
  assert.deepEqual(
    changed.map((pkg) => pkg.name),
    ['@filumo/pdf'],
  );
  assert.match(
    await readFile(join(root, 'packages/pdf/README.md'), 'utf8'),
    /\*\*0\.1\.1\*\*/,
  );
  assert.match(
    await readFile(join(root, 'packages/core/README.md'), 'utf8'),
    /\*\*0\.1\.0\*\*/,
  );
  assert.deepEqual(calls[0], ['exec', 'changeset', 'version']);
  assert.ok(calls[1].includes('--lockfile-only'));
  assert.ok(calls[1].includes('--ignore-scripts'));
  assert.equal(
    calls.some(
      (args) =>
        args.includes('commit') ||
        args.includes('publish') ||
        args.includes('build'),
    ),
    false,
  );
});

test('README 当前版本标记不完整时，先报错，不执行升版', async () => {
  const root = await releaseWorkspace();
  await writeFile(
    join(root, '.changeset/pdf-fix.md'),
    '---\n"@filumo/pdf": patch\n---\n修复 PDF。\n',
  );
  await writeFile(join(root, 'packages/pdf/README.md'), '# PDF\n');
  await assert.rejects(
    versionPackages(root, { run: () => assert.fail('不能升版') }),
    /README/,
  );
});

test('升版期间手动修改的 README 不会被旧快照覆盖', async () => {
  const root = await releaseWorkspace();
  await writeFile(
    join(root, '.changeset/pdf.md'),
    '---\n"@filumo/pdf": patch\n---\n更新 PDF。\n',
  );
  const readme = join(root, 'packages/pdf/README.md');
  await assert.rejects(
    versionPackages(root, {
      run: async (args) => {
        assert.equal(args[0], 'exec');
        const file = join(root, 'packages/pdf/package.json');
        const pkg = JSON.parse(await readFile(file, 'utf8'));
        await writeFile(file, JSON.stringify({ ...pkg, version: '0.1.1' }));
        await writeFile(readme, '用户刚修改的说明。\n');
      },
    }),
    /升版/,
  );
  assert.equal(await readFile(readme, 'utf8'), '用户刚修改的说明。\n');
});

test('实际 Changesets 对 PDF patch 不联动 Viewer，越过 0.1 范围时联动 Viewer', async () => {
  const config = JSON.parse(await readFile('.changeset/config.json', 'utf8'));
  const cli = fileURLToPath(
    new URL('../../node_modules/@changesets/cli/bin.js', import.meta.url),
  );
  for (const [type, pdfVersion, viewerVersion] of [
    ['patch', '0.1.1', '0.1.0'],
    ['minor', '0.2.0', '0.1.1'],
  ]) {
    const root = await releaseWorkspace();
    // 临时用例只验证版本图，不要求 Git 历史或联网安装依赖。
    await writeFile(
      join(root, '.changeset/config.json'),
      JSON.stringify({ ...config, changelog: false, format: false }),
    );
    await writeFile(
      join(root, '.changeset/pdf.md'),
      '---\n"@filumo/pdf": ' + type + '\n---\n更新 PDF。\n',
    );
    execFileSync(process.execPath, [cli, 'version'], {
      cwd: root,
      stdio: 'pipe',
      env: { ...process.env, HUSKY: '0' },
    });
    const pdf = JSON.parse(
      await readFile(join(root, 'packages/pdf/package.json'), 'utf8'),
    );
    const viewer = JSON.parse(
      await readFile(join(root, 'packages/viewer/package.json'), 'utf8'),
    );
    assert.equal(pdf.version, pdfVersion);
    assert.equal(viewer.version, viewerVersion);
  }
});
