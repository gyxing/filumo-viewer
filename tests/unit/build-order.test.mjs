import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBuildOrder } from '../../scripts/build/build-order.mjs';

test('新格式依赖闭包复用 Text 而不依赖 Office', () => {
  const manifests = {
    core: {},
    dom: { dependencies: { '@fivo/core': 'workspace:^' } },
    text: {
      dependencies: { '@fivo/core': 'workspace:^', '@fivo/dom': 'workspace:^' },
    },
    json: {
      dependencies: { '@fivo/text': 'workspace:^', '@fivo/dom': 'workspace:^' },
    },
    markdown: {
      dependencies: { '@fivo/text': 'workspace:^', '@fivo/dom': 'workspace:^' },
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
    dom: { dependencies: { '@fivo/core': 'workspace:^' } },
    office: {
      dependencies: {
        '@fivo/core': 'workspace:^',
        '@fivo/dom': 'workspace:^',
      },
    },
    viewer: { dependencies: { '@fivo/office': 'workspace:^' } },
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
        core: { dependencies: { '@fivo/dom': 'workspace:^' } },
        dom: { dependencies: { '@fivo/core': 'workspace:^' } },
      }),
    /循环依赖/,
  );
});
