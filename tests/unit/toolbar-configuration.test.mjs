import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';

const output = await build({
  entryPoints: ['packages/dom/src/shell/toolbarCapabilities.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { toolbarCapabilities, toolbarConfigurationKey } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(output.outputFiles[0].text).toString('base64')
);

test('回调引用和显隐键顺序变化不产生重复呈现通知，标签变化可以识别', () => {
  const before = [
    { id: 'host.retry', kind: 'action', label: '重新生成', run() {} },
  ];
  const after = [{ ...before[0], run() {} }];
  assert.equal(
    toolbarConfigurationKey(before, { open: false, zoom: true }),
    toolbarConfigurationKey(after, { zoom: true, open: false }),
  );
  assert.notEqual(
    toolbarConfigurationKey(before),
    toolbarConfigurationKey([{ ...after[0], label: '重新加载' }]),
  );
});

test('默认配置保留原能力对象与原有呈现', () => {
  const capabilities = {
    actions: [{ id: 'pdf.rotate', kind: 'action', label: '旋转', run() {} }],
  };
  assert.equal(toolbarCapabilities(capabilities), capabilities);
});

test('显隐按动作 ID 优先于语义名称，隐藏后仍可调用原能力', async () => {
  let calls = 0;
  const capabilities = {
    actions: [
      {
        id: 'pdf.search',
        kind: 'action',
        label: '查找',
        run() {
          calls++;
        },
      },
    ],
    zoom: {
      value: 100,
      min: 10,
      max: 500,
      step: 10,
      async set() {
        calls++;
      },
    },
  };
  const hidden = toolbarCapabilities(capabilities, undefined, {
    search: true,
    'pdf.search': false,
    zoom: false,
  });
  assert.equal(hidden.actions[0].toolbar.visible, false);
  assert.equal(hidden.zoom.toolbar.visible, false);
  assert.equal(capabilities.actions[0].toolbar, undefined);
  hidden.actions[0].run();
  await hidden.zoom.set(125);
  assert.equal(calls, 2);
});

test('宿主操作按 ID 合并，重复 ID 使用最新回调且不修改格式能力', () => {
  let called = '';
  const capabilities = {
    actions: [
      {
        id: 'host.retry',
        kind: 'action',
        label: '旧操作',
        run() {
          called = 'old';
        },
      },
    ],
  };
  const merged = toolbarCapabilities(capabilities, [
    {
      id: 'host.retry',
      kind: 'action',
      label: '重新生成',
      run() {
        called = 'new';
      },
    },
    { id: 'host.close', kind: 'action', label: '关闭', run() {} },
  ]);
  assert.equal(merged.actions.length, 2);
  merged.actions[0].run();
  assert.equal(called, 'new');
  assert.equal(capabilities.actions.length, 1);
});
