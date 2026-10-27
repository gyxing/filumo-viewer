import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const out = await build({
  stdin: {
    contents:
      "export * from './packages/archive/src/reader/detectArchive';export {archive} from './packages/archive/src/descriptor';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [
    {
      name: 'descriptor-only',
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, (args) =>
          args.kind === 'dynamic-import'
            ? { path: args.path, external: true }
            : undefined,
        );
      },
    },
  ],
});
const {
  archiveFormatForName,
  archiveFormatForBytes,
  archiveExtensions,
  archive,
} = await import(
  'data:text/javascript;base64,' +
    Buffer.from(out.outputFiles[0].text).toString('base64')
);
test('组合后缀与单压缩流区分，专用 Office 容器不接管', () => {
  assert.equal(archiveFormatForName('x.tar.gz'), 'targz');
  assert.equal(archiveFormatForName('x.log.gz'), 'gzip');
  assert.equal(archiveFormatForName('x.tar.xz'), 'tarxz');
  assert.equal(archiveFormatForName('x.txz'), 'tarxz');
  assert.equal(archiveFormatForName('x.apk'), 'zip');
  for (const f of ['x.docx', 'x.epub', 'x.json', 'x.zst'])
    assert.equal(archiveFormatForName(f), undefined);
});
test('首版只声明 TAR.XZ/TXZ，单文件 XZ 不匹配且不读取来源', async () => {
  const plugin = archive({
      workerFactory: () => assert.fail('探测不能创建 Worker'),
    }),
    signal = new AbortController().signal;
  assert.ok(archiveExtensions.includes('.tar.xz'));
  assert.ok(archiveExtensions.includes('.txz'));
  assert.ok(!archiveExtensions.includes('.xz'));
  for (const name of ['sample.xz', 'sample.log.xz', 'sample.XZ']) {
    assert.equal(archiveFormatForName(name), undefined);
    assert.equal(
      await plugin.document.detect(
        {
          name,
          mimeType: 'application/x-xz',
          getRangeReader: async () => assert.fail('具名单文件 XZ 不应读取'),
        },
        signal,
      ),
      false,
    );
  }
  for (const name of ['sample.tar.xz', 'sample.txz', 'sample.TAR.XZ'])
    assert.equal(await plugin.document.detect({ name }, signal), true);
  // XZ 签名不能区分载荷，匿名来源只作为 TAR.XZ 候选，后端仍须验证 TAR 结构。
  assert.equal(
    archiveFormatForBytes(new Uint8Array([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0])),
    'tarxz',
  );
});
