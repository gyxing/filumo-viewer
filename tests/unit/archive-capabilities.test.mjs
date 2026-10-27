import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
const out = await build({
  entryPoints: ['packages/archive/src/view/projectCapabilities.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  alias: { '@filumo/core': resolve('packages/core/src/index.ts') },
});
const { projectCapabilities } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(out.outputFiles[0].text).toString('base64')
);
test('顶部转交当前子文件能力，状态保持一致，过期操作全部拒绝', async () => {
  let current = true;
  const calls = [];
  const caps = projectCapabilities(
    {
      actions: [
        {
          id: 'code.search',
          label: '查找',
          kind: 'action',
          run: () => calls.push('search'),
        },
      ],
      zoom: {
        value: 100,
        min: 50,
        max: 200,
        step: 10,
        set: async (value) => {
          calls.push(value);
        },
      },
      navigation: {
        index: 0,
        count: 3,
        goTo: async (value) => {
          calls.push(value);
        },
      },
      search: {
        query: 'x',
        resultCount: 2,
        currentIndex: 0,
        searching: false,
        setQuery: async (value) => {
          calls.push(value);
        },
        next: async () => {
          calls.push('next');
        },
        previous: async () => {
          calls.push('previous');
        },
      },
      download: {
        enabled: true,
        run: async () => {
          calls.push('download');
        },
      },
    },
    () => current,
  );
  assert.equal(caps.actions[0].id, 'archive.entry.code.search');
  assert.equal(caps.zoom.value, 100);
  caps.actions[0].run();
  await caps.zoom.set(120);
  await caps.navigation.goTo(1);
  await caps.search.setQuery('hello');
  await caps.download.run();
  assert.deepEqual(calls, ['search', 120, 1, 'hello', 'download']);
  current = false;
  assert.throws(() => caps.actions[0].run(), { name: 'AbortError' });
  for (const run of [
    () => caps.zoom.set(150),
    () => caps.navigation.goTo(2),
    () => caps.search.next(),
    () => caps.search.previous(),
    () => caps.download.run(),
  ])
    await assert.rejects(run(), { name: 'AbortError' });
  assert.equal(calls.length, 5);
});
test('能力转交保留原始方法的接收对象', async () => {
  const zoom = {
    value: 100,
    min: 50,
    max: 200,
    step: 10,
    async set(value) {
      this.value = value;
    },
  };
  await projectCapabilities({ zoom }, () => true).zoom.set(130);
  assert.equal(zoom.value, 130);
});
