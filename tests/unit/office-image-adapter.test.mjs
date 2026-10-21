import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const bundle = await build({
  entryPoints: ['packages/office/src/view/shared/mountImagePreview.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [
    {
      name: 'public-image-overlay',
      setup(builder) {
        builder.onResolve({ filter: /^@filumo\/image\/view$/ }, () => ({
          path: 'overlay',
          namespace: 'fixture',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          loader: 'js',
          contents: `export async function mountImageOverlay(host,model,options){globalThis.officeImageFixture={host,model,options};return {update(){},setActive(value){globalThis.officeImageFixture.active=value;},async dispose(){}};}`,
        }));
      },
    },
  ],
});
const { mountImagePreview } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

test('Office 仅适配公共弹层，显示租约与停用订阅各有唯一释放者', async () => {
  const source = {
    kind: 'lazy',
    id: 'original',
    mimeType: 'image/x-emf',
    size: 8,
    load: async () => new Blob(['original'], { type: 'image/x-emf' }),
  };
  let released = 0,
    stopped = 0,
    activeChanged;
  const acquired = [];
  const container = { closest: () => null },
    document = {};
  const view = await mountImagePreview(
    { source, name: '原图', mimeType: 'image/x-emf' },
    {},
    {
      container,
      document,
      signal: new AbortController().signal,
      stylePolicy: { nonce: 'fixture' },
      isActive: () => false,
      onActiveChange(listener) {
        activeChanged = listener;
        return () => {
          stopped++;
        };
      },
      onError(error) {
        throw error;
      },
      services: {
        resources: {
          async acquire(input, signal) {
            acquired.push([input, signal]);
            return {
              url: 'blob:converted-png',
              release() {
                released++;
              },
            };
          },
        },
      },
    },
  );
  const fixture = globalThis.officeImageFixture;
  assert.equal(fixture.model.name, '原图.emf');
  assert.equal(fixture.options.stylePolicy.nonce, 'fixture');
  assert.equal(fixture.active, false);
  const signal = new AbortController().signal,
    lease = await fixture.model.resolve(signal);
  assert.equal(acquired[0][0], source);
  assert.equal(acquired[0][1], signal);
  lease.release();
  assert.equal(released, 1);
  activeChanged(true);
  assert.equal(fixture.active, true);
  await view.dispose();
  await view.dispose();
  assert.equal(stopped, 1);
  assert.equal(released, 1);
});

test('Office 下载使用原始 EMF Blob，保持后缀且归还临时下载地址', async () => {
  const original = new Blob(['original-emf'], { type: 'image/x-emf' }),
    blobs = [],
    downloads = [],
    revoked = [];
  const document = {
    baseURI: 'https://example.test/',
    location: { origin: 'https://example.test' },
    body: { appendChild() {} },
    createElement() {
      return {
        style: {},
        click() {
          downloads.push({ href: this.href, name: this.download });
        },
        remove() {},
      };
    },
    defaultView: {
      URL: {
        createObjectURL(blob) {
          blobs.push(blob);
          return 'blob:original';
        },
        revokeObjectURL(url) {
          revoked.push(url);
        },
      },
      setTimeout(run) {
        run();
      },
    },
  };
  const view = await mountImagePreview(
    {
      source: {
        kind: 'lazy',
        id: 'original',
        mimeType: 'image/x-emf',
        size: original.size,
        load: async () => original,
      },
      name: '原图',
      mimeType: 'image/x-emf',
    },
    {},
    {
      container: { closest: () => null },
      document,
      signal: new AbortController().signal,
      onError(error) {
        throw error;
      },
      services: { resources: {} },
    },
  );
  await globalThis.officeImageFixture.model.download(
    new AbortController().signal,
  );
  assert.equal(blobs[0], original);
  assert.equal(downloads[0].name, '原图.emf');
  assert.deepEqual(revoked, ['blob:original']);
  await view.dispose();
});
