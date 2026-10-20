import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createImageDocument } from './helpers/image-dom.mjs';
const bundle = await build({
  stdin: {
    contents: `export {mountImageSurface} from './packages/image/src/view/ImageSurface';export {mountImageOverlay} from './packages/image/src/view/ImageOverlay';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  loader: { '.less': 'empty' },
  plugins: [
    {
      name: 'image-owned-styles',
      setup(builder) {
        builder.onResolve({ filter: /^@fivo\/dom$/ }, () => ({
          path: 'styles',
          namespace: 'fixture',
        }));
        builder.onResolve({ filter: /generated\/package$/ }, () => ({
          path: 'metadata',
          namespace: 'fixture',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          loader: 'js',
          contents:
            path === 'metadata'
              ? `export const STYLE_SCOPE='fivo-image-fixture';`
              : `export function useStyles(){globalThis.imageFixtureStyles++;let closed=false;return()=>{if(!closed){closed=true;globalThis.imageFixtureStyles--;}};}`,
        }));
      },
    },
  ],
});
const { mountImageSurface, mountImageOverlay } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

/** 保留原始按下目标，松手与 click 则模拟指针捕获后的目标重定向。 */
async function overlayGestureFixture() {
  globalThis.imageFixtureStyles = 0;
  const { document, host } = createImageDocument();
  const handle = await mountImageOverlay(
    host,
    {
      name: 'fixture.png',
      resolve: async () => ({ url: 'blob:fixture', release() {} }),
    },
    { signal: new AbortController().signal },
  );
  const overlay = host.children[0].children[0],
    body = overlay.children[1];
  const blank = body.querySelector('.fivo-image-surface'),
    image = blank.children[0];
  blank.classList = {
    contains: (name) => blank.className.split(' ').includes(name),
  };
  let hit = blank;
  document.elementFromPoint = () => hit;
  const send = (type, target, x = 20, y = 20, extra = {}) => {
    hit = extra.hit ?? target;
    const event = {
      target,
      clientX: x,
      clientY: y,
      pointerId: 1,
      button: 0,
      isPrimary: true,
      ...extra,
    };
    if (type === 'click') body.onclick(event);
    else overlay.listeners.get(type)(event);
  };
  return {
    handle,
    overlay,
    host,
    image,
    blank,
    send,
    visible: () => host.children.length === 1,
  };
}

test('图片按下后拖动或单击，捕获重定向的 click 不关闭弹层；下一次空白点击仍可关闭', async () => {
  const fixture = await overlayGestureFixture(),
    { handle, image, blank, send } = fixture;
  try {
    send('pointerdown', image);
    send('pointermove', blank, 90, 60);
    send('pointerup', blank, 90, 60);
    send('click', blank, 90, 60);
    assert.equal(fixture.visible(), true);
    send('pointerdown', image);
    send('pointerup', blank, 20, 20, { hit: image });
    send('click', blank);
    assert.equal(fixture.visible(), true);
    send('pointerdown', blank);
    send('pointerup', blank);
    send('click', blank);
    assert.equal(fixture.visible(), false);
  } finally {
    await handle.dispose();
  }
  assert.equal(globalThis.imageFixtureStyles, 0);
});

test('空白拖动后回到起点也不关闭，松手实际命中图片时不当作空白点击', async () => {
  const fixture = await overlayGestureFixture(),
    { handle, image, blank, send } = fixture;
  try {
    send('pointerdown', blank);
    send('pointermove', blank, 90, 20);
    send('pointermove', blank);
    send('pointerup', blank);
    send('click', blank);
    assert.equal(fixture.visible(), true);
    send('pointerdown', blank);
    send('pointerup', blank, 20, 20, { hit: image });
    send('click', blank);
    assert.equal(fixture.visible(), true);
    send('pointerdown', blank);
    send('pointerup', blank, 90, 20);
    send('click', blank, 90, 20);
    assert.equal(fixture.visible(), true);
    send('pointerdown', blank);
    send('pointerup', blank, 22, 21);
    send('click', blank, 22, 21);
    assert.equal(fixture.visible(), false);
  } finally {
    await handle.dispose();
  }
});

test('手势取消和提前丢失捕获不关闭，正常松手后的丢失捕获不阻断空白点击', async () => {
  const fixture = await overlayGestureFixture(),
    { handle, blank, send } = fixture;
  try {
    for (const type of ['pointercancel', 'lostpointercapture']) {
      send('pointerdown', blank);
      send(type, blank);
      send('pointerup', blank);
      send('click', blank);
      assert.equal(fixture.visible(), true);
    }
    send('pointerdown', blank);
    send('pointerup', blank);
    send('lostpointercapture', blank);
    send('click', blank);
    assert.equal(fixture.visible(), false);
  } finally {
    await handle.dispose();
  }
});

test('非主指针、多指和右键不能关闭弹层，隐藏恢复清除旧手势且销毁移除监听', async () => {
  const fixture = await overlayGestureFixture(),
    { handle, overlay, blank, send } = fixture;
  try {
    for (const extra of [{ isPrimary: false }, { button: 2 }]) {
      send('pointerdown', blank, 20, 20, extra);
      send('pointerup', blank, 20, 20, extra);
      send('click', blank, 20, 20, extra);
      assert.equal(fixture.visible(), true);
    }
    send('pointerdown', blank);
    send('pointerdown', blank, 20, 20, { pointerId: 2, isPrimary: false });
    send('pointerup', blank);
    send('click', blank);
    assert.equal(fixture.visible(), true);
    send('pointerdown', blank);
    send('pointerup', blank);
    handle.setActive(false);
    handle.setActive(true);
    send('click', blank);
    assert.equal(fixture.visible(), true);
    send('pointerdown', blank, 20, 20, { pointerType: 'touch' });
    send('pointermove', blank, 70, 20, { pointerType: 'touch' });
    send('pointerup', blank, 70, 20, { pointerType: 'touch' });
    send('click', blank, 70, 20, { pointerType: 'touch' });
    assert.equal(fixture.visible(), true);
  } finally {
    await handle.dispose();
  }
  assert.equal(overlay.listeners.size, 0);
  assert.equal(globalThis.imageFixtureStyles, 0);
});

test('图片取消期间迟到的租约只释放一次，不遗留样式', async () => {
  globalThis.imageFixtureStyles = 0;
  const { host } = createImageDocument(),
    controller = new AbortController();
  let deliver,
    releases = 0;
  const mounting = mountImageSurface(
    host,
    {
      resolve: () =>
        new Promise((resolve) => {
          deliver = resolve;
        }),
    },
    { signal: controller.signal },
  );
  await Promise.resolve();
  controller.abort();
  deliver({
    url: 'blob:fixture',
    release() {
      releases++;
    },
  });
  const surface = await mounting;
  await surface.dispose();
  assert.equal(releases, 1);
  assert.equal(globalThis.imageFixtureStyles, 0);
  assert.equal(host.children.length, 0);
});

test('图片超出像素限制立即归还资源，重试和销毁保持独立租约', async () => {
  globalThis.imageFixtureStyles = 0;
  const { host } = createImageDocument();
  let releases = 0;
  const surface = await mountImageSurface(
    host,
    {
      resolve: async () => ({
        url: 'blob:fixture',
        release() {
          releases++;
        },
      }),
    },
    { signal: new AbortController().signal, maxDecodedPixels: 100 },
  );
  assert.equal(surface.getSnapshot().status, 'error');
  assert.equal(releases, 1);
  await surface.retry();
  assert.equal(releases, 2);
  await surface.dispose();
  assert.equal(releases, 2);
  assert.equal(globalThis.imageFixtureStyles, 0);
});

test('多个弹层实例独立释放样式，关闭恢复焦点和背景 inert', async () => {
  globalThis.imageFixtureStyles = 0;
  const first = createImageDocument(),
    second = createImageDocument(),
    trigger = first.document.createElement('button'),
    background = first.document.createElement('main');
  first.host.append(background);
  let releases = 0;
  const model = {
    name: 'fixture.png',
    resolve: async () => ({
      url: 'blob:fixture',
      release() {
        releases++;
      },
    }),
  };
  const a = await mountImageOverlay(first.host, model, {
      signal: new AbortController().signal,
      trigger,
    }),
    b = await mountImageOverlay(second.host, model, {
      signal: new AbortController().signal,
    });
  assert.equal(background.inert, true);
  assert.equal(globalThis.imageFixtureStyles, 4);
  const overlay = first.host.children[1].children[0];
  overlay.onkeydown({ key: 'Escape', preventDefault() {} });
  await a.dispose();
  assert.equal(background.inert, undefined);
  assert.equal(first.document.activeElement, trigger);
  assert.equal(releases, 1);
  assert.equal(globalThis.imageFixtureStyles, 2);
  await b.dispose();
  assert.equal(releases, 2);
  assert.equal(globalThis.imageFixtureStyles, 0);
});
