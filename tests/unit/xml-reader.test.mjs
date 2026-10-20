import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const result = await build({
  entryPoints: ['packages/xml/src/parser/scanXml.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  absWorkingDir: process.cwd(),
});

test('XML 深度、属性预算与预先取消不交付半棵树', async () => {
  const signal = new AbortController().signal;
  assert.equal(
    (
      await scanXml(
        '<a><b><c/></b></a>',
        { maxDepth: 2, maxNodes: 100 },
        signal,
      )
    ).kind,
    'limited',
  );
  assert.equal(
    (
      await scanXml(
        '<a x="1" y="2" z="3"/>',
        { maxDepth: 20, maxNodes: 2 },
        signal,
      )
    ).kind,
    'limited',
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    scanXml('<a/>', { maxDepth: 20, maxNodes: 100 }, controller.signal),
    { name: 'AbortError' },
  );
});
const { scanXml } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')
);
test('XML 命名空间、属性及实体原文范围保持一致', async () => {
  const text =
      '<r xmlns:p="urn:test"><p:x a="&amp;"><![CDATA[<原文>]]>值&amp;</p:x></r>',
    signal = new AbortController().signal;
  const parsed = await scanXml(
    text,
    { maxDepth: 256, maxNodes: 200000 },
    signal,
  );
  assert.equal(parsed.kind, 'ready');
  const node = parsed.document.nodes.find((node) => node.name === 'p:x');
  assert.equal(node.namespaceUri, 'urn:test');
  const attribute = parsed.document.nodes.find((node) => node.name === 'a');
  assert.equal(text.slice(attribute.start, attribute.end), 'a="&amp;"');
  assert.equal(attribute.value, '&');
  assert.ok(parsed.document.nodes.some((node) => node.kind === 'cdata'));
  assert.equal(
    (
      await scanXml(
        '<!DOCTYPE r SYSTEM "https://invalid.test/x"><r/>',
        { maxDepth: 256, maxNodes: 200000 },
        signal,
      )
    ).kind,
    'invalid',
  );
});
