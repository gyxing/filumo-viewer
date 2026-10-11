import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { installFrozenConsumer } from '../../scripts/testing/install-consumer.mjs';

test('独立消费者必须首次安装、冻结复装，且锁文件保持不变', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fivo-install-test-'));
  const commands = [];
  const result = await installFrozenConsumer(directory, async (args) => {
    commands.push(args);
    if (commands.length === 1)
      await writeFile(
        join(directory, 'pnpm-lock.yaml'),
        'lockfileVersion: 9.0\n',
      );
  });
  assert.equal(commands.length, 2);
  assert.ok(commands[0].includes('--no-frozen-lockfile'));
  assert.ok(commands[1].includes('--frozen-lockfile'));
  assert.equal(result.frozenInstall, 'passed');
  assert.match(result.lockSha256, /^[0-9a-f]{64}$/);
});

test('冻结复装改变锁或命令失败时不得记录通过', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fivo-install-failure-'));
  let count = 0;
  await assert.rejects(
    installFrozenConsumer(directory, async () => {
      await writeFile(join(directory, 'pnpm-lock.yaml'), String(++count));
    }),
    /锁文件/,
  );
  await assert.rejects(
    installFrozenConsumer(directory, async () => {
      throw new Error('安装失败');
    }),
    /安装失败/,
  );
});

import {
  assessCompletion,
  requiredChecks,
} from '../../scripts/checks/evidence.mjs';
test('验收必须拒绝空报告、漏格式、旧源码与缺少冻结复装', () => {
  assert.equal(
    assessCompletion({ digest: 'current' }).technicalComplete,
    false,
  );
  const fixture = {
    digest: 'current',
    consumers: {
      cases: [
        'vanilla',
        'react18',
        'react19',
        'react-strict',
        'vue3',
        'vue26',
        'vue27',
      ].map((id) => ({
        id,
        build: 'passed',
        frozenInstall: 'passed',
        lockSha256: 'a'.repeat(64),
      })),
    },
    publicRun: {
      tests: requiredChecks('public').map((title) => ({
        title,
        status: 'passed',
      })),
      exitCode: 0,
      passed: 17,
      failed: 0,
      skipped: 0,
      sourceDigest: 'current',
    },
    localRun: {
      tests: requiredChecks('local').map((title) => ({
        title,
        status: 'passed',
      })),
      exitCode: 0,
      passed: 16,
      failed: 0,
      skipped: 0,
      sourceDigest: 'current',
    },
    formats: [
      'basic-docx',
      'basic-xlsx',
      'basic-pptx',
      'word-long-table',
      'links-doc',
      'links-docx',
      'links-xls',
      'links-xlsx',
      'links-ppt',
      'links-pptx',
      'binary-word',
      'binary-sheet',
      'binary-slides',
    ].map((id) => ({
      sample: { id, format: id.startsWith('links-') ? id.slice(6) : 'docx' },
      status: 'passed',
      reference: true,
    })),
    baseline: {
      sourceDigest: 'current',
      samples: ['word-long-table', 'links-xls', 'links-ppt'].map((id) => ({
        id,
        legacy: Array(5).fill({ readyMs: 10 }),
        native: Array(5).fill({ readyMs: 12 }),
      })),
    },
  };
  assert.equal(assessCompletion(fixture).technicalComplete, true);
  assert.equal(assessCompletion(fixture).userAcceptance, 'pending');
  for (const mutate of [
    (f) => {
      f.consumers.cases[0].frozenInstall = 'pending';
    },
    (f) => {
      f.formats.pop();
    },
    (f) => {
      f.publicRun.sourceDigest = 'old';
    },
    (f) => {
      f.localRun.tests = [];
    },
    (f) => {
      f.baseline.samples[0].native.pop();
    },
  ]) {
    const changed = structuredClone(fixture);
    mutate(changed);
    assert.equal(assessCompletion(changed).technicalComplete, false);
  }
});
