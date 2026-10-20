import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument } from './helpers/reading-dom.mjs';

const bundle = await build({
  stdin: {
    contents: `export {getActionPresentation} from './packages/dom/src/shell/actionPresentation';export {bindCapabilities} from './packages/dom/src/shell/bindCapabilities';export {actionMenuItem} from './packages/dom/src/shell/toolbarMenuItems';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [
    {
      name: 'toolbar-layout-boundary',
      setup(builder) {
        builder.onResolve({ filter: /^\.\/overflow$/ }, () => ({
          path: 'overflow',
          namespace: 'fixture',
        }));
        builder.onResolve({ filter: /^\.\/OptionPopup$/ }, () => ({
          path: 'popup',
          namespace: 'fixture',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          loader: 'js',
          contents:
            path === 'overflow'
              ? `export function createToolbarOverflow(container){return{close(){},update(items){container.replaceChildren(...items.filter(item=>!item.secondary).map(item=>item.node));},dispose(){container.replaceChildren();}};}`
              : `export function createOptionPopup(anchor,owner,onClose){const element=owner.ownerDocument.createElement('div');element.id='options';element.hidden=true;owner.append(element);return{element,position(){},open(){element.hidden=false;},close(){if(!element.hidden){element.hidden=true;onClose();}},get opened(){return !element.hidden;},dispose(){element.remove();}};}`,
        }));
      },
    },
  ],
});
const { getActionPresentation, bindCapabilities, actionMenuItem } =
  await import(
    'data:text/javascript;base64,' +
      Buffer.from(bundle.outputFiles[0].text).toString('base64')
  );

/** 只模拟节点与类名，布局尺寸和浮层定位不在此单元用例内。 */
function toolbarDocument() {
  const document = createDocument(),
    create = document.createElement;
  document.createElement = (tag) => {
    const node = create();
    node.tagName = tag.toUpperCase();
    node.closest = () => null;
    node.removeAttribute = (name) => node.attributes.delete(name);
    node.classList = {
      add(...names) {
        node.className = [
          ...new Set([
            ...(node.className ?? '').split(' ').filter(Boolean),
            ...names,
          ]),
        ].join(' ');
      },
      contains(name) {
        return (node.className ?? '').split(' ').includes(name);
      },
      toggle(name, value) {
        const names = new Set(
          (node.className ?? '').split(' ').filter(Boolean),
        );
        if (value) names.add(name);
        else names.delete(name);
        node.className = [...names].join(' ');
      },
    };
    const query = node.querySelector.bind(node);
    node.querySelector = (selector) =>
      selector === 'svg'
        ? node.children.find((child) => child.tagName === 'SVG')
        : query(selector);
    return node;
  };
  document.createElementNS = (_namespace, tag) => document.createElement(tag);
  return document;
}

test('标准动作隐藏文字，面板和模式操作保留文字，未知动作避免成为空按钮', () => {
  for (const id of ['image.rotate', 'image.reset', 'custom.download'])
    assert.equal(
      getActionPresentation({ id, kind: 'action' }).showLabel,
      false,
    );
  for (const id of [
    'office.search',
    'markdown.outline',
    'office.notes',
    'image.fit',
    'image.actual',
  ])
    assert.equal(getActionPresentation({ id, kind: 'toggle' }).showLabel, true);
  assert.equal(
    getActionPresentation({
      id: 'image.rotate',
      kind: 'action',
      toolbar: { showLabel: true },
    }).showLabel,
    true,
  );
  assert.equal(
    getActionPresentation({
      id: 'office.search',
      kind: 'toggle',
      toolbar: { showLabel: false },
    }).showLabel,
    false,
  );
  assert.deepEqual(
    getActionPresentation({
      id: 'custom.unknown',
      kind: 'action',
      toolbar: { showLabel: false },
    }),
    { icon: undefined, showLabel: true },
  );
});

test('普通按钮与选择控件遵循 showLabel，更新时复用节点并保留当前值和选中状态', () => {
  const document = toolbarDocument(),
    container = document.createElement('div'),
    binding = bindCapabilities(container, (error) => {
      throw error;
    });
  const actions = [
    { id: 'image.rotate', kind: 'action', label: '旋转', run() {} },
    {
      id: 'office.outline',
      kind: 'toggle',
      label: '大纲',
      pressed: true,
      run() {},
    },
    {
      id: 'office.sheetMode',
      kind: 'select',
      label: '表格视图',
      value: 'source',
      options: [{ value: 'source', label: '原始布局' }],
      run() {},
    },
  ];
  try {
    binding.update({ actions });
    const rotate = container.children.find(
        (node) => node.dataset.fivoAction === 'image.rotate',
      ),
      outline = container.children.find(
        (node) => node.dataset.fivoAction === 'office.outline',
      ),
      mode = container.children.find(
        (node) => node.dataset.fivoAction === 'office.sheetMode',
      );
    const rotateLabel = rotate.querySelector('.fivo-button-label'),
      modeLabel = mode.children[0],
      value = mode.querySelector('.fivo-select-value'),
      icon = mode.querySelector('.fivo-select-icon');
    assert.equal(rotate.classList.contains('fivo-icon-button'), true);
    assert.equal(rotate.getAttribute('aria-label'), '旋转');
    assert.equal(rotate.title, '旋转');
    assert.equal(outline.classList.contains('fivo-icon-button'), false);
    assert.equal(outline.getAttribute('aria-pressed'), 'true');
    assert.equal(modeLabel.hidden, true);
    assert.equal(value.textContent, '原始布局');
    assert.ok(icon);
    binding.update({
      actions: actions.map((action) => ({
        ...action,
        toolbar: { showLabel: true },
      })),
    });
    assert.equal(container.children[0], rotate);
    assert.equal(rotate.querySelector('.fivo-button-label'), rotateLabel);
    assert.equal(rotate.classList.contains('fivo-icon-button'), false);
    assert.equal(modeLabel.hidden, false);
    assert.equal(mode.querySelector('.fivo-select-value'), value);
    assert.equal(mode.querySelector('.fivo-select-icon'), icon);
    binding.update({
      actions: actions.map((action) => ({
        ...action,
        toolbar: { showLabel: false },
      })),
    });
    assert.equal(outline.classList.contains('fivo-icon-button'), true);
    assert.equal(modeLabel.hidden, true);
    assert.equal(value.textContent, '原始布局');
  } finally {
    binding.dispose();
  }
});

test('菜单仍保留图标和完整名称，不继承主栏的文字隐藏规则', () => {
  const action = {
    id: 'image.rotate',
    kind: 'action',
    label: '旋转',
    toolbar: { showLabel: false },
    run() {},
  };
  const menu = actionMenuItem(action, true);
  assert.equal(menu.label, '旋转');
  assert.equal(menu.icon, getActionPresentation(action).icon);
});
