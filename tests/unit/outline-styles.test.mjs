import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
import { stylePlugin } from '../../scripts/build/styles.mjs';
import { createDocument } from './helpers/reading-dom.mjs';

/** 使用真实 Less 编译和样式注册，覆盖仅模拟 DOM 的交互用例未检查的加载链。 */
function documentFixture() {
  const document = createDocument(),
    create = document.createElement;
  document.createElement = (...args) => {
    const element = create(...args);
    element.sheet = {};
    return element;
  };
  document.head = document.createElement('head');
  return document;
}

for (const entry of ['outline/OutlineTree', 'outline']) {
  test(`公共树通过 ${entry} 源码消费时实际注册完整样式`, async () => {
    const root = process.cwd(),
      styles = new Map();
    const result = await build({
      stdin: {
        contents: `export { OutlineTree } from './packages/dom/src/${entry}';`,
        resolveDir: root,
      },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
      treeShaking: true,
      minify: true,
      plugins: [
        stylePlugin({ group: 'dom', version: '0.1.0-next.0' }, styles, root),
      ],
    });
    const { OutlineTree } = await import(
      'data:text/javascript;base64,' +
        Buffer.from(result.outputFiles[0].text).toString('base64')
    );
    const document = documentFixture();
    assert.equal(document.head.children.length, 0);
    const tree = new OutlineTree({
      document,
      stylePolicy: { nonce: 'outline-style-regression' },
      accessors: {
        getId: (node) => node.id,
        getText: (node) => node.title,
        isLeaf: () => true,
        getChildren: () => [],
      },
      onToggle() {},
      onActivate() {},
    });
    try {
      assert.ok(styles.has('packages/dom/src/outline.less'));
      assert.equal(document.head.children.length, 1);
      const sheet = document.head.children[0];
      assert.equal(sheet.nonce, 'outline-style-regression');
      assert.match(
        sheet.textContent,
        /\.fivo-outline-row\s*\{[^}]*position:\s*absolute/,
      );
      assert.match(
        sheet.textContent,
        /\.fivo-outline-label\s*\{[^}]*font-size:\s*14px/,
      );
      assert.match(sheet.textContent, /\.fivo-outline-switcher\s*>\s*span/);
      assert.match(sheet.textContent, /\.fivo-outline-branch::after/);
    } finally {
      tree.dispose();
    }
    assert.equal(document.head.children.length, 0);
  });
}
