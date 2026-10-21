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

test('共享原文样式的两个实例保留 nonce，最后一个卸载才释放', () => {
  const elements = [];
  const document = {
    head: {
      append(element) {
        elements.push(element);
      },
    },
    createElement() {
      return {
        dataset: {},
        sheet: {},
        remove() {
          elements.splice(elements.indexOf(this), 1);
        },
      };
    },
  };
  registerStyle(
    'text-lease-fixture',
    'text-lease-fixture:0.1.0:1111111111111111',
    '.filumo-text-scope{height:100%}',
  );
  const first = useStyles('text-lease-fixture', document, {
    nonce: 'fixture-nonce',
  });
  const second = useStyles('text-lease-fixture', document, {
    nonce: 'fixture-nonce',
  });
  assert.equal(elements.length, 1);
  assert.equal(elements[0].nonce, 'fixture-nonce');
  first();
  assert.equal(elements.length, 1);
  second();
  assert.equal(elements.length, 0);
});
const { registerStyle, replaceStyle, useStyles } = await import(
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

test('开发样式原位替换且多个租约独立释放，不积累旧标签', () => {
  const elements = [];
  const document = {
    head: {
      append(element) {
        elements.push(element);
      },
    },
    createElement() {
      return {
        dataset: {},
        sheet: {},
        textContent: '',
        remove() {
          elements.splice(elements.indexOf(this), 1);
        },
      };
    },
  };
  replaceStyle('dev', 'dev-style', 'a{color:red}');
  const first = useStyles('dev', document),
    second = useStyles('dev', document);
  assert.equal(elements.length, 1);
  replaceStyle('dev', 'dev-style', 'a{color:blue}');
  assert.equal(elements.length, 1);
  assert.equal(elements[0].textContent, 'a{color:blue}');
  first();
  assert.equal(elements.length, 1);
  second();
  assert.equal(elements.length, 0);
  assert.throws(() => replaceStyle('other', 'dev-style', 'b{}'), /冲突/);
});
