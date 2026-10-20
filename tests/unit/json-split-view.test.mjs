import { textSourceAliases } from './helpers/text-source-aliases.mjs';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
const bundle = await build({
  stdin: {
    resolveDir: resolve('.'),
    contents: `export {textSegments} from './packages/dom/src/text/textSegments';
  export {jsonLineDecorations} from './packages/json/src/view/jsonTokens';
  export {jsonTreeGuides,jsonNodeRange,jsonNodePreview} from './packages/json/src/view/treeRows';
  export {scanJson} from './packages/json/src/parser/scanJson';`,
  },
  alias: textSourceAliases,
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const {
  textSegments,
  jsonLineDecorations,
  jsonTreeGuides,
  jsonNodeRange,
  jsonNodePreview,
  scanJson,
} = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
test('语法与查找及定位交叠时保留每个源字符及背景优先级', () => {
  const text = '"key":12345';
  const segments = textSegments(
    0,
    text.length,
    jsonLineDecorations(text, 0, text.length),
    [{ start: 2, end: 8, current: true }],
    { start: 0, end: 5 },
  );
  assert.equal(segments.map((s) => text.slice(s.start, s.end)).join(''), text);
  assert.ok(
    segments.some(
      (s) =>
        s.start === 2 &&
        s.emphasis === 'current' &&
        s.className.endsWith('key'),
    ),
  );
  assert.equal(segments[0].emphasis, 'reveal');
  assert.deepEqual(
    textSegments(
      0,
      3,
      [
        { start: -2, end: 1, className: 'syntax' },
        { start: 2, end: 2, className: 'empty' },
      ],
      [],
    ).map((s) => [s.start, s.end]),
    [
      [0, 1],
      [1, 3],
    ],
  );
  assert.equal(
    textSegments(0, 3, [{ start: 0, end: 3, className: '<img>' }], [])[0]
      .className,
    undefined,
  );
});
test('JSON 原生词法不改大数字、字符串转义，长行不截断', () => {
  const text = '{"n":900719925474099312345,"x":"a\\"b","none":null,"ok":true}';
  const decorations = jsonLineDecorations(text, 0, text.length);
  assert.ok(
    decorations.some(
      (d) =>
        d.className.endsWith('number') &&
        text.slice(d.start, d.end) === '900719925474099312345',
    ),
  );
  assert.ok(
    decorations.some(
      (d) =>
        d.className.endsWith('string') &&
        text.slice(d.start, d.end) === '"a\\"b"',
    ),
  );
  assert.equal(
    jsonLineDecorations('"key"\n :1', 0, 5)[0].className,
    'fivo-json-token-key',
  );
  assert.deepEqual(jsonLineDecorations('1'.repeat(65537), 0, 65537), []);
  assert.equal(textSegments(0, 65537, [], []).at(-1).end, 65537);
});
test('虚拟行连接线按真实兄弟位置生成，容器定位不强调整个对象', async () => {
  const raw = '{"a":{"child":1},"a":2,"last":[]}';
  const model = (
    await scanJson(
      raw,
      { maxDepth: 256, maxNodes: 100 },
      new AbortController().signal,
    )
  ).document;
  const properties = model.nodes.filter((n) => n.type === 'property');
  const first = model.nodes[Number(properties[0].childIds[0])];
  assert.deepEqual(jsonTreeGuides(model, first.id), [true]);
  const last = model.nodes[Number(properties.at(-1).childIds[0])];
  assert.deepEqual(jsonTreeGuides(model, last.id), [false]);
  assert.equal(jsonNodePreview(model, first), 'Object (1)');
  assert.equal(jsonNodePreview(model, last), 'Array (0)');
  assert.deepEqual(jsonNodeRange(model, first.id), {
    start: properties[0].start,
    end: first.start + 1,
  });
  assert.deepEqual(jsonNodeRange(model, model.rootId), { start: 0, end: 1 });
});
