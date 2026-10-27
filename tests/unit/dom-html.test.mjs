import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
const out = await build({
  entryPoints: ['packages/dom/src/html.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  alias: { '@filumo/core': resolve('packages/core/src/index.ts') },
});
const api = await import(
  'data:text/javascript;base64,' +
    Buffer.from(out.outputFiles[0].text).toString('base64')
);
test('HTML 公共规则拒绝活动内容和样式资源，不提前依赖格式引擎', () => {
  for (const tag of ['script', 'style', 'iframe', 'meta', 'base'])
    assert.ok(api.blockedHtmlTags.has(tag));
  assert.equal(api.allowedHtmlStyle('position', 'fixed'), false);
  assert.equal(api.allowedHtmlStyle('background-image', 'url(x)'), false);
});
test('明确阻止的图片不回退外网；未配置时不自动请求图片', async () => {
  const signal = new AbortController().signal;
  assert.equal(
    await api.resolveHtmlResource(
      'https://example.test/a.png',
      'image',
      undefined,
      signal,
    ),
    undefined,
  );
  assert.equal(
    await api.resolveHtmlResource(
      'a.png',
      'image',
      { baseUrl: 'https://example.test/', resolveResource: () => undefined },
      signal,
    ),
    undefined,
  );
  assert.equal(
    await api.resolveHtmlResource(
      'a.png',
      'image',
      { baseUrl: 'https://example.test/' },
      signal,
    ),
    'https://example.test/a.png',
  );
});
