import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
import { preparePackageMetadata } from '../../scripts/build/metadata.mjs';
await preparePackageMetadata(process.cwd());
const result = await build({
  entryPoints: ['packages/dom/src/styles.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { registerStyle, useStyles } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')
);
const documentWith = (value) => ({
  documentElement: {},
  defaultView: { getComputedStyle: () => ({ getPropertyValue: () => value }) },
});
test('external 校验样式所属包而非 DOM 版本，未知/过期/冲突均拒绝', () => {
  registerStyle(
    'future-office',
    'future-office:2.3.0-next.1:0123456789abcdef',
    'a{}',
  );
  assert.doesNotThrow(() =>
    useStyles('future-office', documentWith('2.3.0-next.1'), {
      mode: 'external',
    })(),
  );
  assert.throws(
    () =>
      useStyles('future-office', documentWith('1.2.0'), { mode: 'external' }),
    /样式/,
  );
  assert.throws(
    () =>
      useStyles('unknown', documentWith('2.3.0-next.1'), { mode: 'external' }),
    /样式/,
  );
  registerStyle('future-office', 'future-office:2.4.0:0123456789abcdef', 'b{}');
  assert.throws(
    () =>
      useStyles('future-office', documentWith('2.4.0'), { mode: 'external' }),
    /样式/,
  );
});
test('旧自定义 ID 的自动注册仍可用，重复 ID 的不同内容拒绝', () => {
  assert.doesNotThrow(() => registerStyle('custom', 'my-style', 'p{}'));
  assert.throws(() => registerStyle('custom', 'my-style', 'a{}'), /冲突/);
});
