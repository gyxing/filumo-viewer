import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const result = await build({
  entryPoints: ['packages/json/src/parser/scanJson.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { scanJson } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')
);
const read = (text) =>
  scanJson(
    text,
    { maxDepth: 256, maxNodes: 200000 },
    new AbortController().signal,
  );

test('复制路径区分根节点和空键，并转义特殊属性名', async () => {
  const compiled = await build({
    entryPoints: ['packages/json/src/parser/jsonPath.ts'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
  });
  const { jsonPath } = await import(
    'data:text/javascript;base64,' +
      Buffer.from(compiled.outputFiles[0].text).toString('base64')
  );
  const model = (await read('{"":1,"a/b~c":[true]}')).document;
  assert.equal(jsonPath(model, model.rootId), '');
  const empty = model.nodes.find(
    (node) => node.type === 'property' && node.key === '',
  );
  assert.equal(jsonPath(model, empty.childIds[0]), '/');
  const boolean = model.nodes.find((node) => node.type === 'boolean');
  assert.equal(jsonPath(model, boolean.id), '/a~1b~0c/0');
});

test('标准 JSON 接受结果与原生一致，数字和重复键按源范围保存', async () => {
  for (const raw of [
    '{}',
    '[]',
    'true',
    'false',
    'null',
    '123',
    '"x"',
    '[1,-2.5e+3,{"x":"\\u4e2d"}]',
  ]) {
    JSON.parse(raw);
    assert.equal((await read(raw)).kind, 'ready', raw);
  }
  for (const raw of [
    '',
    '01',
    '+1',
    '1.',
    '1e',
    '{"x":1,}',
    '[1,]',
    '{x:1}',
    '"\\q"',
    '"\n"',
    '[',
    '{} {}',
    'falsex',
  ])
    assert.equal((await read(raw)).kind, 'invalid', raw);
  const raw =
    '{"n":900719925474099312345,"x":1,"x":2,"__proto__":{"polluted":true}}';
  const data = (await read(raw)).document;
  assert.ok(
    data.nodes.some(
      (n) =>
        n.type === 'number' &&
        raw.slice(n.start, n.end) === '900719925474099312345',
    ),
  );
  assert.equal(
    data.nodes.filter((n) => n.type === 'property' && n.key === 'x').length,
    2,
  );
  assert.equal(
    data.nodes.filter((n) => n.type === 'property' && n.key === '__proto__')
      .length,
    1,
  );
  assert.ok(data.diagnostics.some((d) => d.severity === 'warning'));
  assert.equal(Object.prototype.polluted, undefined);
});

test('限额、错误位置和取消保持明确', async () => {
  assert.equal(
    (
      await scanJson(
        '[[]]',
        { maxDepth: 1, maxNodes: 99 },
        new AbortController().signal,
      )
    ).kind,
    'invalid',
  );
  assert.equal(
    (
      await scanJson(
        '[1,2]',
        { maxDepth: 256, maxNodes: 2 },
        new AbortController().signal,
      )
    ).kind,
    'invalid',
  );
  assert.equal((await read('{\n  "x": [1,]\n}')).diagnostics.at(-1).line, 2);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    scanJson('{}', { maxDepth: 256, maxNodes: 200000 }, controller.signal),
  );
});
