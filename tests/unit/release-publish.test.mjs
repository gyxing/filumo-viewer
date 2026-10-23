import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import {
  validateBuildArtifacts,
  readPackedManifest,
} from '../../scripts/release/artifacts.mjs';
import {
  checkReleaseGit,
  publishRelease,
} from '../../scripts/release/publish.mjs';
import {
  releasePackages,
  releaseWorkspace,
  fakePack,
  manifestArchive,
} from './helpers/release-fixtures.mjs';

test('真实 Git 检查拒绝非 master 或脏工作区，不自动清理文件', () => {
  assert.throws(
    () => checkReleaseGit('.', (args) => (args[0] === 'branch' ? 'next' : '')),
    /master/,
  );
  assert.throws(
    () =>
      checkReleaseGit('.', (args) =>
        args[0] === 'branch' ? 'master' : ' M package.json',
      ),
    /工作区/,
  );
  assert.doesNotThrow(() =>
    checkReleaseGit('.', (args) => (args[0] === 'branch' ? 'master' : '')),
  );
});

test('发布前检查分支和清单，失败时不打包、不上传', async () => {
  const packages = releasePackages({ pdf: { version: '0.1.1' } });
  const root = await releaseWorkspace(packages);
  await assert.rejects(
    publishRelease(root, ['@filumo/pdf'], {
      checkGit: () => {
        throw Error('仅允许 master');
      },
      pack: () => assert.fail('不能打包'),
      publish: () => assert.fail('不能发布'),
    }),
    /master/,
  );
  await writeFile(
    join(root, 'packages/pdf/dist/build-manifest.json'),
    JSON.stringify({ package: '@filumo/pdf', version: '0.1.0', outputs: [] }),
  );
  await assert.rejects(
    validateBuildArtifacts(root, packages.get('@filumo/pdf')),
    /构建/,
  );
});

test('构建清单不能读取 dist 外部资源或同名前缀目录', async () => {
  const packages = releasePackages();
  const root = await releaseWorkspace(packages);
  const pkg = packages.get('@filumo/pdf');
  await writeFile(
    join(root, 'packages/pdf/dist/build-manifest.json'),
    JSON.stringify({
      package: pkg.name,
      version: pkg.version,
      outputs: [{ file: '../dist-other/index.js' }],
    }),
  );
  await assert.rejects(validateBuildArtifacts(root, pkg), /越界/);
});

test('全部 tarball 核验之后才写 npm，发布已核验文件且不开启生命周期', async () => {
  const packages = releasePackages({ pdf: { version: '0.1.1' } });
  const root = await releaseWorkspace(packages);
  const published = [];
  const result = await publishRelease(root, ['@filumo/pdf'], {
    checkGit() {},
    getVersions: async () => ['0.1.0'],
    pack: fakePack(packages),
    publish: async (record, args) => {
      assert.equal((await readPackedManifest(record.file)).version, '0.1.1');
      assert.ok(args.includes('--config.ignore-scripts=true'));
      assert.ok(args.includes('--publish-branch=master'));
      published.push(record.name);
    },
  });
  assert.deepEqual(published, ['@filumo/pdf']);
  assert.deepEqual(result.published, ['@filumo/pdf']);
  assert.deepEqual(result.remaining, []);
});

test('打包后残留 workspace 或版本/依赖不符时不能开始发布', async () => {
  const packages = releasePackages({ pdf: { version: '0.1.1' } });
  const root = await releaseWorkspace(packages);
  await assert.rejects(
    publishRelease(root, ['@filumo/pdf'], {
      checkGit() {},
      getVersions: async () => ['0.1.0'],
      pack: fakePack(packages, {
        pdf: { '@filumo/core': 'workspace:^', '@filumo/dom': '^0.1.0' },
      }),
      publish: () => assert.fail('不能发布'),
    }),
    /依赖|workspace/,
  );
});

test('多包中途失败保留已完成和剩余清单，重试跳过 registry 已存在的版本', async () => {
  const packages = releasePackages({
    core: { version: '0.1.1' },
    pdf: { version: '0.1.1' },
  });
  const root = await releaseWorkspace(packages);
  let calls = 0;
  await assert.rejects(
    publishRelease(root, ['@filumo/core', '@filumo/pdf'], {
      checkGit() {},
      getVersions: async () => ['0.1.0'],
      pack: fakePack(packages),
      publish: () => {
        if (++calls === 2) throw Error('upload failed');
      },
    }),
    (error) => {
      assert.deepEqual(error.report.published, ['@filumo/core']);
      assert.equal(error.report.failed, '@filumo/pdf');
      assert.deepEqual(error.report.remaining, ['@filumo/pdf']);
      return true;
    },
  );
  const result = await publishRelease(root, ['@filumo/core', '@filumo/pdf'], {
    checkGit() {},
    getVersions: async (name) =>
      name === '@filumo/core' ? ['0.1.0', '0.1.1'] : ['0.1.0'],
    pack: fakePack(packages),
    publish() {},
  });
  assert.deepEqual(result.published, ['@filumo/pdf']);
});

test('压缩包读取只取普通 manifest，拒绝损坏和截断的 tar', async () => {
  const root = await releaseWorkspace();
  const file = join(root, 'fixture.tgz');
  await writeFile(
    file,
    manifestArchive({ name: '@filumo/pdf', version: '0.1.1' }),
  );
  assert.equal((await readPackedManifest(file)).name, '@filumo/pdf');
  const bytes = await readFile(file);
  await writeFile(file, bytes.subarray(0, bytes.length - 20));
  await assert.rejects(readPackedManifest(file));
});
