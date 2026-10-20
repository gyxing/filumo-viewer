import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const bundle = await build({
  stdin: {
    contents: `export {calculateImageFitScale} from './packages/image/src/view/imageTransform'; export {getImageFileName} from './packages/image/src/view/imageName'; export {detectImageBytes} from './packages/image/src/runtime/detectImage'; export {openImage} from './packages/image/src/runtime/openImage';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const {
  calculateImageFitScale,
  getImageFileName,
  detectImageBytes,
  openImage,
} = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

test('无 MIME 的 SVG File 只补全显示类型，原始字节保持不变', async () => {
  const blob = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>']);
  const source = {
    name: 'fixture.svg',
    readBlob: async () => blob,
    readAll: async () => {
      throw Error('不应重复读取');
    },
    dispose: async () => {},
  };
  const session = await openImage(
    source,
    {
      sessionId: 'image-fixture',
      signal: new AbortController().signal,
      reportProgress() {},
    },
    {},
  );
  try {
    assert.equal(session.data.blob.type, 'image/svg+xml');
    assert.equal(blob.type, '');
    assert.equal(await session.data.blob.text(), await blob.text());
  } finally {
    await session.dispose();
  }
});
test('图片适应使用旋转包围尺寸，小图不放大', () => {
  assert.equal(calculateImageFitScale(100, 50, 500, 400, 0), 1);
  assert.equal(calculateImageFitScale(1200, 800, 600, 400, 0), 0.5);
  assert.equal(calculateImageFitScale(1200, 800, 600, 400, 90), 1 / 3);
  assert.equal(calculateImageFitScale(0, 0, 0, 0, 0), 1);
});
test('标题与下载名称保留后缀，MIME 只补缺失扩展名', () => {
  assert.equal(
    getImageFileName({ name: '示例.png', mimeType: 'image/png' }),
    '示例.png',
  );
  assert.equal(
    getImageFileName({ name: '示例', mimeType: 'image/png' }),
    '示例.png',
  );
  assert.equal(
    getImageFileName({ name: '原图.emf', mimeType: 'image/png' }),
    '原图.emf',
  );
  const long = getImageFileName({ name: 'a'.repeat(150) + '.svg' });
  assert.equal(long.length, 120);
  assert.equal(long.endsWith('.svg'), true);
});
test('图片签名探测排除任意 XML 与普通文本', () => {
  assert.equal(
    detectImageBytes(Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)),
    true,
  );
  assert.equal(
    detectImageBytes(new TextEncoder().encode('<xml>text</xml>')),
    false,
  );
  assert.equal(detectImageBytes(new TextEncoder().encode('BMP text')), false);
});
