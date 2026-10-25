import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, unlink, writeFile } from 'node:fs/promises';
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

test('仅同步升版包的双语 README，锁文件更新明确关闭生命周期，不提交 Git', async () => {
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
    /This documentation covers \*\*0\.1\.1\*\*/,
  );
  assert.match(
    await readFile(join(root, 'packages/pdf/README.zh-CN.md'), 'utf8'),
    /本文档对应 \*\*0\.1\.1\*\*/,
  );
  assert.match(
    await readFile(join(root, 'packages/core/README.md'), 'utf8'),
    /\*\*0\.1\.0\*\*/,
  );
  assert.match(
    await readFile(join(root, 'packages/core/README.zh-CN.md'), 'utf8'),
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

test('任一语言 README 缺失或版本标记缺失、重复时，先报错，不执行升版', async () => {
  for (const file of ['README.md', 'README.zh-CN.md']) {
    for (const problem of [
      'missing-file',
      'missing-marker',
      'duplicate-marker',
    ]) {
      const root = await releaseWorkspace();
      await writeFile(
        join(root, '.changeset/pdf-fix.md'),
        '---\n"@filumo/pdf": patch\n---\n修复 PDF。\n',
      );
      const path = join(root, 'packages/pdf', file);
      const original = await readFile(path, 'utf8');
      if (problem === 'missing-file') await unlink(path);
      else
        await writeFile(
          path,
          problem === 'missing-marker' ? '# PDF\n' : original + original,
        );
      await assert.rejects(
        versionPackages(root, { run: () => assert.fail('不能升版') }),
        /README/,
      );
    }
  }
});

test('任一语言并发修改时拒绝覆盖，另一语言不会先被写入', async () => {
  for (const file of ['README.md', 'README.zh-CN.md']) {
    const root = await releaseWorkspace();
    await writeFile(
      join(root, '.changeset/pdf.md'),
      '---\n"@filumo/pdf": patch\n---\n更新 PDF。\n',
    );
    const readme = join(root, 'packages/pdf', file);
    const other = join(
      root,
      'packages/pdf',
      file === 'README.md' ? 'README.zh-CN.md' : 'README.md',
    );
    const originalOther = await readFile(other, 'utf8');
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
    assert.equal(await readFile(other, 'utf8'), originalOther);
  }
});

test('多个包升版时先检查全部说明，后一个包冲突不会写入前一个包', async () => {
  const root = await releaseWorkspace();
  await writeFile(
    join(root, '.changeset/update.md'),
    '---\n"@filumo/core": patch\n"@filumo/pdf": patch\n---\n更新。\n',
  );
  const core = join(root, 'packages/core/README.md');
  const original = await readFile(core, 'utf8');
  await assert.rejects(
    versionPackages(root, {
      run: async (args) => {
        assert.equal(args[0], 'exec');
        for (const name of ['core', 'pdf']) {
          const file = join(root, 'packages', name, 'package.json');
          const pkg = JSON.parse(await readFile(file, 'utf8'));
          await writeFile(file, JSON.stringify({ ...pkg, version: '0.1.1' }));
        }
        await writeFile(
          join(root, 'packages/pdf/README.zh-CN.md'),
          '刚更新的中文文档。\n',
        );
      },
    }),
    /升版/,
  );
  assert.equal(await readFile(core, 'utf8'), original);
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
