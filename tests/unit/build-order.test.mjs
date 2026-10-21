import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBuildOrder } from '../../scripts/build/build-order.mjs';

test('新格式依赖闭包复用 Text 而不依赖 Office', () => {
  const manifests = {
    core: {},
    dom: { dependencies: { '@filumo/core': 'workspace:^' } },
    text: {
      dependencies: { '@filumo/core': 'workspace:^', '@filumo/dom': 'workspace:^' },
    },
    json: {
      dependencies: { '@filumo/text': 'workspace:^', '@filumo/dom': 'workspace:^' },
    },
    markdown: {
      dependencies: { '@filumo/text': 'workspace:^', '@filumo/dom': 'workspace:^' },
    },
  };
  assert.deepEqual(resolveBuildOrder(['json'], manifests), [
    'core',
    'dom',
    'text',
    'json',
  ]);
  assert.equal(
    resolveBuildOrder(['markdown'], manifests).includes('office'),
    false,
  );
});

test('构建请求包时补齐 workspace 前置依赖并保持拓扑顺序', () => {
  const manifests = {
    core: { dependencies: {} },
    dom: { dependencies: { '@filumo/core': 'workspace:^' } },
    office: {
      dependencies: {
        '@filumo/core': 'workspace:^',
        '@filumo/dom': 'workspace:^',
      },
    },
    viewer: { dependencies: { '@filumo/office': 'workspace:^' } },
  };
  assert.deepEqual(resolveBuildOrder(['viewer'], manifests), [
    'core',
    'dom',
    'office',
    'viewer',
  ]);
});

test('构建顺序拒绝未知包和循环依赖', () => {
  assert.throws(
    () => resolveBuildOrder(['missing'], { core: { dependencies: {} } }),
    /未知包/,
  );
  assert.throws(
    () =>
      resolveBuildOrder(['core'], {
        core: { dependencies: { '@filumo/dom': 'workspace:^' } },
        dom: { dependencies: { '@filumo/core': 'workspace:^' } },
      }),
    /循环依赖/,
  );
});
