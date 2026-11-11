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

test('宿主图标覆盖语义映射，null 隐藏并保留可识别按钮', () => {
  const icon = {
    mount() {
      return { dispose() {} };
    },
  };
  assert.deepEqual(
    getActionPresentation({
      id: 'custom.close',
      kind: 'action',
      icon,
      toolbar: { showLabel: false },
    }),
    { icon, showLabel: false },
  );
  assert.deepEqual(
    getActionPresentation({
      id: 'custom.close',
      kind: 'action',
      icon: null,
      toolbar: { showLabel: false },
    }),
    { icon: null, showLabel: true },
  );
  assert.equal(
    actionMenuItem(
      { id: 'custom.close', label: '关闭', kind: 'action', icon: null },
      true,
    ).icon,
    null,
  );
  assert.equal(
    actionMenuItem(
      { id: 'custom.close', label: '关闭', kind: 'action', icon },
      true,
    ).icon,
    icon,
  );
});

test('宿主图标按操作复用，更新状态，隐藏与移除均释放，重新显示重新挂载', () => {
  const document = toolbarDocument();
  const container = document.createElement('div');
  const errors = [];
  const binding = bindCapabilities(container, (error) => errors.push(error));
  let mounted = 0;
  let disposed = 0;
  const states = [];
  const icon = {
    mount(host, context) {
      mounted++;
      assert.equal(context.document, document);
      assert.equal(context.placement, 'toolbar');
      host.append(document.createElement('span'));
      return {
        update(next) {
          states.push(next.action);
        },
        dispose() {
          disposed++;
        },
      };
    },
  };
  const action = {
    id: 'host.custom',
    kind: 'action',
    label: '刷新',
    icon,
    toolbar: { showLabel: false },
    run() {},
  };
  binding.update({ actions: [action] });
  const button = container.children[0];
  binding.update({ actions: [{ ...action, enabled: false, label: '忙碌' }] });
  assert.equal(mounted, 1);
  assert.equal(states.at(-1).enabled, false);
  assert.equal(states.at(-1).label, '忙碌');
  assert.equal(container.children[0], button);
  assert.equal(button.classList.contains('filumo-icon-button'), true);
  const updates = states.length;
  binding.update({ actions: [{ ...action, enabled: false, label: '忙碌' }] });
  assert.equal(states.length, updates);
  binding.update({ actions: [{ ...action, toolbar: { visible: false } }] });
  assert.equal(disposed, 1);
  binding.update({ actions: [action] });
  assert.equal(mounted, 2);
  binding.update({ actions: [] });
  assert.equal(disposed, 2);
  binding.dispose();
  assert.equal(disposed, 2);
  assert.deepEqual(errors, []);
});

test('默认图标在连续状态更新后仍存在，自定义替换会清理旧实例', () => {
  const document = toolbarDocument();
  const container = document.createElement('div');
  const binding = bindCapabilities(container, (error) => {
    throw error;
  });
  const action = { id: 'host.close', label: '关闭', kind: 'action', run() {} };
  binding.update({ actions: [action] });
  const button = container.children[0];
  const svg = button.querySelector('svg');
  assert.ok(svg);
  binding.update({ actions: [{ ...action, enabled: false }] });
  assert.equal(button.querySelector('svg'), svg);
  let disposed = 0;
  binding.update({
    actions: [
      {
        ...action,
        icon: {
          mount() {
            return {
              dispose() {
                disposed++;
              },
            };
          },
        },
      },
    ],
  });
  assert.equal(button.querySelector('svg'), undefined);
  binding.update({ actions: [action] });
  assert.equal(disposed, 1);
  assert.ok(button.querySelector('svg'));
  binding.dispose();
});

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
        (node) => node.dataset.filumoAction === 'image.rotate',
      ),
      outline = container.children.find(
        (node) => node.dataset.filumoAction === 'office.outline',
      ),
      mode = container.children.find(
        (node) => node.dataset.filumoAction === 'office.sheetMode',
      );
    const rotateLabel = rotate.querySelector('.filumo-button-label'),
      modeLabel = mode.children[0],
      value = mode.querySelector('.filumo-select-value'),
      icon = mode.querySelector('.filumo-select-icon');
    assert.equal(rotate.classList.contains('filumo-icon-button'), true);
    assert.equal(rotate.getAttribute('aria-label'), '旋转');
    assert.equal(rotate.title, '旋转');
    assert.equal(outline.classList.contains('filumo-icon-button'), false);
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
    assert.equal(rotate.querySelector('.filumo-button-label'), rotateLabel);
    assert.equal(rotate.classList.contains('filumo-icon-button'), false);
    assert.equal(modeLabel.hidden, false);
    assert.equal(mode.querySelector('.filumo-select-value'), value);
    assert.equal(mode.querySelector('.filumo-select-icon'), icon);
    binding.update({
      actions: actions.map((action) => ({
        ...action,
        toolbar: { showLabel: false },
      })),
    });
    assert.equal(outline.classList.contains('filumo-icon-button'), true);
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

test('选择控件默认展开，显式更多与隐藏设置生效，边界禁用保留入口', () => {
  const document = toolbarDocument();
  const container = document.createElement('div');
  const binding = bindCapabilities(container, (error) => {
    throw error;
  });
  const select = {
    id: 'custom.sheet',
    kind: 'select',
    label: '工作表',
    value: 'one',
    options: [{ value: 'one', label: '表一' }],
    run() {},
  };
  try {
    binding.update({ actions: [select] });
    assert.equal(container.children.length, 1);
    binding.update({
      actions: [{ ...select, toolbar: { placement: 'more' } }],
    });
    assert.equal(container.children.length, 0);
    binding.update({ actions: [{ ...select, enabled: false }] });
    assert.equal(container.children.length, 1);
    assert.equal(
      container.children[0].querySelector('.filumo-select-trigger').disabled,
      true,
    );
    binding.update({ actions: [{ ...select, toolbar: { visible: false } }] });
    assert.equal(container.children.length, 0);
  } finally {
    binding.dispose();
  }
});

test('文档未就绪时宿主恢复操作按自身状态可用，格式操作继续禁用', () => {
  const document = toolbarDocument();
  const container = document.createElement('div');
  const binding = bindCapabilities(container, (error) => {
    throw error;
  });
  const actions = [
    { id: 'pdf.search', kind: 'action', label: '查找', run() {} },
    { id: 'host.close', kind: 'action', label: '关闭', run() {} },
  ];
  try {
    binding.update({ actions }, 'zh-CN', false, [], new Set(['host.close']));
    assert.equal(container.children[0].disabled, true);
    assert.equal(container.children[1].disabled, false);
    binding.update(
      { actions: actions.map((action) => ({ ...action, enabled: false })) },
      'zh-CN',
      false,
      [],
      new Set(['host.close']),
    );
    assert.equal(container.children[1].disabled, true);
  } finally {
    binding.dispose();
  }
});
