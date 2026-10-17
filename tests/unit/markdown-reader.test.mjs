import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const output = await build({
  entryPoints: ['packages/markdown/src/parser/parseMarkdown.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { parseMarkdown } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(output.outputFiles[0].text).toString('base64')
);

test('Markdown 基础与 GFM 结构保持 token，HTML 不预编译成可执行界面', async () => {
  const source =
    '# Title\n\n# Title\n\n- [x] done\n- [ ] pending\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nconst a = 1;\n```\n\n<script>alert(1)</script>';
  const data = await parseMarkdown(source, new AbortController().signal);
  assert.deepEqual(
    data.headings.map((h) => h.id),
    ['title', 'title-1'],
  );
  assert.ok(data.tokens.some((t) => t.type === 'table'));
  assert.ok(
    data.tokens.some((t) => t.type === 'list' && t.items[0].checked === true),
  );
  assert.ok(data.tokens.some((t) => t.type === 'code' && t.lang === 'js'));
  assert.ok(data.tokens.some((t) => t.type === 'html'));
  assert.equal(data.text, source);
});

test('已有后缀标题与重复标题仍使用唯一锚点', async () => {
  const data = await parseMarkdown(
    '# x\n\n# x-1\n\n# x\n\n# x',
    new AbortController().signal,
  );
  const ids = data.headings.map((heading) => heading.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('带格式标题提取可读文字，重复标题与行内代码原文同时保留', async () => {
  const source = [
    '## **重点** 与 `API` [说明](https://example.com)',
    '## 重点 与 API 说明',
    '',
    '`&amp; <Widget>  a`',
    '',
    '- [ ] 待处理',
    '- [x] 已完成',
  ].join('\n');
  const data = await parseMarkdown(source, new AbortController().signal);
  assert.deepEqual(
    data.headings.map(({ title }) => title),
    ['重点 与 API 说明', '重点 与 API 说明'],
  );
  assert.deepEqual(
    data.headings.map(({ id }) => id),
    ['重点-与-api-说明', '重点-与-api-说明-1'],
  );
  const code = data.tokens
    .find((token) => token.type === 'paragraph')
    .tokens.find((token) => token.type === 'codespan');
  assert.equal(code.text, '&amp; <Widget>  a');
  const tasks = data.tokens.find((token) => token.type === 'list').items;
  assert.deepEqual(tasks.map((item) => item.checked), [false, true]);
  for (const item of tasks)
    assert.equal(
      item.tokens.filter((token) => token.type === 'checkbox').length,
      1,
    );
});
