import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument } from './helpers/reading-dom.mjs';

const bundle = await build({
  stdin: {
    contents: `export {createZoomControl} from './packages/dom/src/shell/ZoomControl';export {getZoomPresets} from './packages/dom/src/shell/zoomPresets';export {zoomMenuItem} from './packages/dom/src/shell/toolbarMenuItems';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [
    {
      name: 'zoom-control-dom',
      setup(builder) {
        builder.onResolve({ filter: /^\.\/icons$/ }, () => ({
          path: 'icons',
          namespace: 'fixture',
        }));
        builder.onResolve({ filter: /^\.\/OptionPopup$/ }, () => ({
          path: 'popup',
          namespace: 'fixture',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          loader: 'js',
          contents:
            path === 'icons'
              ? `export function labelShellButton(node,label){node.setAttribute('aria-label',label);}`
              : `export function createOptionPopup(anchor,owner,onClose){const element=owner.ownerDocument.createElement('div');element.id='zoom-options';element.hidden=true;owner.append(element);return{element,position(){},open(){element.hidden=false;},close(){element.hidden=true;onClose();},get opened(){return !element.hidden;},dispose(){element.remove();}};}`,
        }));
      },
    },
  ],
});
const { getZoomPresets, createZoomControl, zoomMenuItem } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

test('默认预设只到 200%，按格式范围过滤并由主栏与更多菜单共用', () => {
  const zoom = { value: 100, min: 50, max: 500, step: 10, set: async () => {} };
  assert.deepEqual(getZoomPresets(zoom), [50, 75, 100, 125, 150, 200]);
  assert.deepEqual(
    getZoomPresets({ ...zoom, min: 1 }),
    [25, 50, 75, 100, 125, 150, 200],
  );
  assert.deepEqual(
    zoomMenuItem(zoom, false, true)
      .children.filter((item) => item.id.startsWith('toolbar.zoom.value:'))
      .map((item) => item.label),
    ['50%', '75%', '100%', '125%', '150%', '200%'],
  );
  assert.deepEqual(
    getZoomPresets({ ...zoom, presets: [100, 75, 100, NaN, 40] }),
    [75, 100],
  );
});

test('未声明预设的格式使用百分比下拉，同时保留小数显示和手动提交', async () => {
  const document = createDocument(),
    create = document.createElement;
  document.createElement = () => {
    const node = create();
    node.closest = () => null;
    node.removeAttribute = (name) => node.attributes.delete(name);
    node.scrollIntoView = () => {};
    return node;
  };
  const calls = [],
    control = createZoomControl(document, (error) => {
      throw error;
    });
  try {
    control.update(
      {
        value: 66.9,
        min: 1,
        max: 500,
        step: 10,
        set: async (value) => {
          calls.push(value);
        },
      },
      'zh-CN',
      true,
    );
    const input = control.element.children[0].children[0];
    assert.equal(input.getAttribute('role'), 'combobox');
    assert.equal(input.value, '66.9');
    input.onfocus();
    const list = control.element.children.at(-1);
    assert.deepEqual(
      list.children.map((option) => option.textContent),
      ['25%', '50%', '75%', '100%', '125%', '150%', '200%'],
    );
    input.value = '90.5';
    input.oninput();
    input.onkeydown({
      key: 'Enter',
      preventDefault() {},
      stopPropagation() {},
    });
    await Promise.resolve();
    assert.deepEqual(calls, [90.5]);
  } finally {
    control.dispose();
  }
});
