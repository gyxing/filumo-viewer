import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { createDocument } from './helpers/reading-dom.mjs';
const result = await build({
  stdin: {
    contents:
      "export {XmlTree} from './packages/xml/src/view/XmlTree'; export {xmlNodeLabel, xmlNodeParts} from './packages/xml/src/view/xmlRows';",
    resolveDir: process.cwd(),
  },
  alias: { '@fivo/dom/outline': resolve('packages/dom/src/outline.ts') },
  loader: { '.less': 'empty' },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { XmlTree, xmlNodeLabel, xmlNodeParts } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')
);

test('XML 富标签区分名称和值，数字布尔外观仍保持字符串，原文定位不变', () => {
  const nodes = [
    { id: '0', kind: 'document', childIds: ['1'], start: 0, end: 180 },
    {
      id: '1',
      parentId: '0',
      kind: 'element',
      name: 'p:user',
      childIds: ['2', '3', '4', '5', '6', '7'],
      start: 0,
      end: 180,
    },
    {
      id: '2',
      parentId: '1',
      kind: 'attribute',
      name: 'id',
      value: '001',
      childIds: [],
      start: 8,
      end: 16,
    },
    {
      id: '3',
      parentId: '1',
      kind: 'attribute',
      name: 'enabled',
      value: 'true',
      childIds: [],
      start: 17,
      end: 31,
    },
    {
      id: '4',
      parentId: '1',
      kind: 'namespace',
      name: 'xmlns:p',
      value: 'urn:example',
      childIds: [],
      start: 32,
      end: 53,
    },
    {
      id: '5',
      parentId: '1',
      kind: 'text',
      value: '<b>文本</b>',
      childIds: [],
      start: 54,
      end: 75,
    },
    {
      id: '6',
      parentId: '1',
      kind: 'cdata',
      value: '<原文>',
      childIds: [],
      start: 76,
      end: 95,
    },
    {
      id: '7',
      parentId: '1',
      kind: 'comment',
      value: '说明',
      childIds: [],
      start: 96,
      end: 110,
    },
  ];
  const navigated = [],
    tree = new XmlTree(
      { nodes, rootId: '0' },
      createDocument(),
      (range) => navigated.push(range),
      () => {},
    );
  try {
    const row = tree.element.querySelector('[data-outline-id="3"]');
    assert.equal(
      row.querySelector('.fivo-xml-node-name').textContent,
      'enabled',
    );
    assert.equal(row.querySelector('.fivo-xml-node-value').textContent, 'true');
    assert.equal(row.getAttribute('aria-label'), '@enabled = "true"');
    row.onclick();
    assert.deepEqual(navigated, [{ start: 17, end: 31 }]);
    assert.equal(
      tree.element
        .querySelector('[data-outline-id="3"]')
        .getAttribute('aria-selected'),
      'true',
    );
    assert.equal(
      tree.element
        .querySelector('[data-outline-id="3"]')
        .querySelector('.fivo-xml-node-value').textContent,
      'true',
    );
    assert.equal(
      tree.element
        .querySelector('[data-outline-id="2"]')
        .querySelector('.fivo-xml-node-value').textContent,
      '001',
    );
    assert.equal(
      tree.element
        .querySelector('[data-outline-id="5"]')
        .querySelector('.fivo-xml-node-value').textContent,
      '<b>文本</b>',
    );
    assert.equal(xmlNodeLabel(nodes[4]), 'xmlns:p = "urn:example"');
    assert.equal(xmlNodeLabel(nodes[6]), '<![CDATA[<原文>]]>');
    assert.equal(xmlNodeLabel(nodes[7]), '<!-- 说明 -->');
    assert.ok(
      xmlNodeParts(nodes[3]).every(
        (part) => part.kind !== 'number' && part.kind !== 'boolean',
      ),
    );
  } finally {
    tree.dispose();
  }
});

test('XML 长值摘要和处理指令仍使用完整文本名称', () => {
  const long = {
    kind: 'attribute',
    name: 'note',
    value: '内容'.repeat(80),
    truncated: true,
  };
  assert.ok(xmlNodeLabel(long).endsWith('…"'));
  assert.equal(
    xmlNodeLabel({ kind: 'processing', value: 'display mode="read"' }),
    '<?display mode="read"?>',
  );
  assert.equal(
    xmlNodeParts({ kind: 'processing', value: 'display mode="read"' }).find(
      (part) => part.kind === 'name',
    ).text,
    'display',
  );
});
test('XML 树缩放同时更新行高，原文查找选择不反向导航', () => {
  const nodes = [
    {
      id: '0',
      kind: 'document',
      childIds: Array.from({ length: 60 }, (_, i) => String(i + 1)),
      start: 0,
      end: 600,
    },
  ];
  for (let i = 1; i <= 60; i++)
    nodes.push({
      id: String(i),
      parentId: '0',
      kind: 'element',
      name: '相同名称',
      childIds: [],
      start: i * 10 - 10,
      end: i * 10,
    });
  const navigated = [],
    tree = new XmlTree(
      { nodes, rootId: '0' },
      createDocument(),
      (range) => navigated.push(range),
      () => {},
    );
  try {
    tree.update(false, 'zh-CN', 200);
    tree.revealNode('40');
    assert.equal(tree.element.style['--fivo-outline-row-height'], '56px');
    assert.ok(tree.element.scrollTop > 0);
    assert.deepEqual(navigated, []);
  } finally {
    tree.dispose();
  }
});
