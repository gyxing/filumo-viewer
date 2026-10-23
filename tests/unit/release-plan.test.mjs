import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createReleasePlan } from '../../scripts/release/plan.mjs';
import { readRegistryVersions } from '../../scripts/release/registry.mjs';
import {
  loadReleasePackages,
  selectReleasePackages,
} from '../../scripts/release/workspace.mjs';
import {
  releasePackages,
  releaseWorkspace,
} from './helpers/release-fixtures.mjs';

test('普通 PDF patch 只发布 PDF，兼容范围内的 Viewer 不参与', async () => {
  const packages = releasePackages({ pdf: { version: '0.1.1' } });
  const plan = await createReleasePlan(packages, ['@filumo/pdf'], async () => [
    '0.1.0',
  ]);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.order, ['@filumo/pdf']);
  assert.equal(packages.get('@filumo/viewer').version, '0.1.0');
});

test('首次发布保留十五个 0.1.0，前置依赖排在使用者前面', async () => {
  const packages = releasePackages();
  const plan = await createReleasePlan(
    packages,
    [...packages.keys()],
    async () => [],
  );
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.order.length, 15);
  assert.ok(
    plan.order.indexOf('@filumo/core') < plan.order.indexOf('@filumo/dom'),
  );
  assert.ok(
    plan.order.indexOf('@filumo/image') < plan.order.indexOf('@filumo/office'),
  );
  assert.ok(
    plan.order.indexOf('@filumo/pdf') < plan.order.indexOf('@filumo/viewer'),
  );
  assert.ok(plan.rows.every((row) => row.version === '0.1.0'));
});

test('依赖新版 Core 未发布时给出联动清单，不静默扩大发布范围', async () => {
  const packages = releasePackages({
    core: { version: '0.1.1' },
    pdf: { version: '0.1.1' },
  });
  const plan = await createReleasePlan(packages, ['@filumo/pdf'], async () => [
    '0.1.0',
  ]);
  assert.ok(plan.errors.some((error) => error.code === 'MISSING_DEPENDENCY'));
  assert.ok(plan.required.includes('@filumo/core'));
  assert.deepEqual(plan.order, ['@filumo/pdf']);
  const complete = await createReleasePlan(
    packages,
    ['@filumo/core', '@filumo/pdf'],
    async () => ['0.1.0'],
  );
  assert.deepEqual(complete.errors, []);
  assert.deepEqual(complete.order, ['@filumo/core', '@filumo/pdf']);
});

test('已发布版本跳过，registry 错误不能变成待发布状态', async () => {
  const packages = releasePackages();
  const plan = await createReleasePlan(packages, ['@filumo/pdf'], async () => [
    '0.1.0',
  ]);
  assert.deepEqual(plan.order, []);
  assert.equal(plan.rows[0].status, 'published');
  await assert.rejects(
    createReleasePlan(packages, ['@filumo/pdf'], async () => {
      throw Error('registry unavailable');
    }),
    /registry unavailable/,
  );
});

test('明确要求的新 Core 最低版本不能由不兼容本地版本补足', async () => {
  const packages = releasePackages({
    pdf: {
      version: '0.1.1',
      dependencies: {
        '@filumo/core': 'workspace:^0.2.0',
        '@filumo/dom': 'workspace:^',
      },
    },
  });
  const plan = await createReleasePlan(
    packages,
    ['@filumo/core', '@filumo/pdf'],
    async () => ['0.1.0'],
  );
  assert.ok(plan.errors.some((error) => error.dependency === '@filumo/core'));
});

test('包选择拒绝未知目标和路径，私有应用不进入正式清单', async () => {
  const packages = await loadReleasePackages(process.cwd());
  assert.equal(packages.size, 15);
  assert.deepEqual(selectReleasePackages(['pdf', '@filumo/core'], packages), [
    '@filumo/pdf',
    '@filumo/core',
  ]);
  assert.equal(selectReleasePackages(['--all'], packages).length, 15);
  for (const args of [['../pdf'], ['*'], ['filumo-docs'], ['--all', 'pdf']])
    assert.throws(() => selectReleasePackages(args, packages));
  const root = await releaseWorkspace();
  assert.equal((await loadReleasePackages(root)).size, 15);
});

test('registry 仅明确结构化 404 表示不存在，保留其他失败', async () => {
  const run = () => {
    const error = Error('request failed');
    error.stdout = JSON.stringify({ error: { code: 'E404' } });
    throw error;
  };
  assert.deepEqual(
    await readRegistryVersions('@filumo/pdf', { root: process.cwd(), run }),
    [],
  );
  for (const code of ['E401', 'E403', 'E429', 'ETIMEDOUT']) {
    await assert.rejects(
      readRegistryVersions('@filumo/pdf', {
        root: process.cwd(),
        run: () => {
          const error = Error('private response');
          error.stdout = JSON.stringify({ error: { code } });
          throw error;
        },
      }),
      new RegExp(code),
    );
  }
  await assert.rejects(
    readRegistryVersions('@filumo/pdf', {
      root: process.cwd(),
      run: () => 'not-json',
    }),
    /registry/,
  );
});

test('Changesets 独立版本配置不自动提交或绑定全部包', async () => {
  const config = JSON.parse(await readFile('.changeset/config.json', 'utf8'));
  assert.equal(config.baseBranch, 'master');
  assert.equal(config.access, 'public');
  assert.equal(config.commit, false);
  assert.deepEqual(config.fixed, []);
  assert.deepEqual(config.linked, []);
  assert.deepEqual(config.privatePackages, { version: false, tag: false });
});
