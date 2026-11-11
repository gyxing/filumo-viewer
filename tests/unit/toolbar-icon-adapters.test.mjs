import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument } from './helpers/reading-dom.mjs';

/** 模拟框架挂载边界，检查转换、更新和清理协议，实际框架上下文由人工验收。 */
async function adapter(name, runtime) {
  const result = await build({
    entryPoints: [
      `packages/${name}/src/toolbarIcons.${name === 'react' ? 'tsx' : 'ts'}`,
    ],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    plugins: [
      {
        name: 'framework-boundary',
        setup(builder) {
          builder.onResolve(
            { filter: /^(react|react-dom|vue)$/ },
            ({ path }) => ({ path, namespace: 'fixture' }),
          );
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
            contents: runtime,
            loader: 'js',
          }));
        },
      },
    ],
  });
  return import(
    'data:text/javascript;base64,' +
      Buffer.from(result.outputFiles[0].text).toString('base64')
  );
}

test('React 图标转换保持定义稳定，Portal 内容更新，原生图标透传并释放各位置', async () => {
  const { useToolbarIcons } = await adapter(
    'react',
    `
    export const useRef = value => ({current:value});
    export const useState = value => [value, () => {}];
    export const useEffect = fn => fn();
    export const createPortal = (node, container, key) => ({node,container,key});
  `,
  );
  const bridge = useToolbarIcons();
  const action = { id: 'host.action', label: '操作', kind: 'action', run() {} };
  const firstNode = { type: 'svg', props: { phase: 1 } };
  const first = bridge.convert({
    toolbarActions: [{ ...action, icon: firstNode }],
  }).toolbarActions[0];
  const main = {},
    menu = {};
  const a = first.icon.mount(main),
    b = first.icon.mount(menu);
  assert.equal(bridge.render().length, 2);
  assert.equal(bridge.render()[0].node, firstNode);
  const nextNode = { type: 'svg', props: { phase: 2 } };
  const next = bridge.convert({
    toolbarActions: [{ ...action, icon: nextNode }],
  }).toolbarActions[0];
  assert.equal(next.icon, first.icon);
  assert.equal(bridge.render()[1].node, nextNode);
  const native = { mount() {} };
  assert.equal(
    bridge.convert({ toolbarActions: [{ ...action, icon: native }] })
      .toolbarActions[0].icon,
    native,
  );
  assert.equal(
    bridge.convert({ toolbarActions: [{ ...action, icon: false }] })
      .toolbarActions[0].icon,
    null,
  );
  a.dispose();
  b.dispose();
  a.dispose();
  assert.equal(bridge.render().length, 0);
});

test('Vue 3 每个位置独立生成 VNode，Teleport 接收最新上下文并清理', async () => {
  const { createToolbarIcons } = await adapter(
    'vue',
    `
    export const shallowRef = value => ({value});
    export const triggerRef = () => {};
    export const onBeforeUnmount = () => {};
    export const Teleport = 'Teleport';
    export const h = (type, props, children) => ({type,props,children});
  `,
  );
  const bridge = createToolbarIcons();
  const action = { id: 'host.action', label: '操作', kind: 'action', run() {} };
  const render = (context) => ({
    placement: context.placement,
    label: context.action.label,
  });
  const icon = bridge.convert({ toolbarActions: [{ ...action, icon: render }] })
    .toolbarActions[0].icon;
  const main = {},
    menu = {};
  const a = icon.mount(main, { placement: 'toolbar', action });
  const b = icon.mount(menu, { placement: 'menu', action });
  assert.equal(bridge.render()[0].type, 'Teleport');
  assert.equal(bridge.render()[0].props.to, main);
  assert.equal(bridge.render()[1].children[0].placement, 'menu');
  a.update({ placement: 'toolbar', action: { ...action, label: '更新' } });
  assert.equal(bridge.render()[0].children[0].label, '更新');
  assert.equal(
    bridge.convert({ toolbarActions: [{ ...action, icon: render }] })
      .toolbarActions[0].icon,
    icon,
  );
  const native = { mount() {} };
  assert.equal(
    bridge.convert({ toolbarActions: [{ ...action, icon: native }] })
      .toolbarActions[0].icon,
    native,
  );
  a.dispose();
  b.dispose();
  assert.equal(bridge.render().length, 0);
});

test('Vue 2 图标子组件关联宿主父实例，更新与销毁覆盖菜单和主栏', async () => {
  const { createToolbarIcons } = await adapter(
    'vue2',
    `
    export default class Vue {
      constructor(options) { this.options=options; this.$el={instance:this}; this.destroyed=0; }
      $mount() { this.$forceUpdate(); }
      $forceUpdate() { this.vnode=this.options.render(type=>({type})); }
      $destroy() { this.destroyed++; }
    }
  `,
  );
  const owner = {};
  const bridge = createToolbarIcons(owner);
  const action = { id: 'host.action', label: '操作', kind: 'action', run() {} };
  const children = [];
  const container = () => ({
    appendChild(node) {
      children.push(node);
    },
  });
  const icon = bridge.convert({
    toolbarActions: [
      { ...action, icon: (h, context) => ({ label: context.action.label }) },
    ],
  }).toolbarActions[0].icon;
  const a = icon.mount(container(), { action, placement: 'toolbar' });
  const b = icon.mount(container(), { action, placement: 'menu' });
  assert.equal(children.length, 2);
  assert.equal(children[0].instance.options.parent, owner);
  a.update({ action: { ...action, label: '更新' }, placement: 'toolbar' });
  assert.equal(children[0].instance.vnode.label, '更新');
  bridge.convert({ toolbarActions: [] });
  a.dispose();
  b.dispose();
  bridge.dispose();
  assert.equal(children[0].instance.destroyed, 1);
  assert.equal(children[1].instance.destroyed, 1);
  const native = { mount() {} };
  assert.equal(
    bridge.convert({ toolbarActions: [{ ...action, icon: native }] })
      .toolbarActions[0].icon,
    native,
  );
});

test('更多菜单接收循环引用图标对象，复用实例，删除条目和销毁时清理', async () => {
  const result = await build({
    entryPoints: ['packages/dom/src/shell/ToolbarMenu.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    plugins: [
      {
        name: 'layout-boundary',
        setup(builder) {
          builder.onResolve(
            { filter: /^\.\/(menuPlacement|OptionPopup)$/ },
            () => ({ path: 'layout', namespace: 'fixture' }),
          );
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
            contents:
              'export const closeOptionPopups=()=>{}; export const measureToolbarMenu=()=>100; export const positionToolbarMenu=()=>{};',
          }));
        },
      },
    ],
  });
  const { createToolbarMenu } = await import(
    'data:text/javascript;base64,' +
      Buffer.from(result.outputFiles[0].text).toString('base64')
  );
  const document = createDocument();
  document.addEventListener = document.removeEventListener = () => {};
  const create = document.createElement;
  document.createElement = () => {
    const node = create();
    node.querySelectorAll = () => [];
    node.hasAttribute = (key) => node.attributes.has(key);
    node.insertBefore = (child, cursor) => {
      child.remove();
      const index = cursor
        ? node.children.indexOf(cursor)
        : node.children.length;
      node.children.splice(index, 0, child);
      child.parentElement = node;
    };
    Object.defineProperty(node, 'firstChild', { get: () => node.children[0] });
    Object.defineProperty(node, 'nextSibling', {
      get: () =>
        node.parentElement?.children[
          node.parentElement.children.indexOf(node) + 1
        ],
    });
    return node;
  };
  const owner = document.createElement(),
    trigger = document.createElement();
  owner.append(trigger);
  let mounted = 0,
    disposed = 0,
    updated = 0;
  const icon = {
    mount(_host, context) {
      assert.equal(context.placement, 'menu');
      mounted++;
      return {
        update() {
          updated++;
        },
        dispose() {
          disposed++;
        },
      };
    },
  };
  icon.circular = icon;
  const menu = createToolbarMenu(trigger, owner, (error) => {
    throw error;
  });
  const item = { id: 'host', label: '操作', icon };
  menu.update([item], '更多');
  menu.update([{ ...item, label: '更新' }], '更多');
  assert.equal(mounted, 1);
  assert.equal(updated, 1);
  menu.update([], '更多');
  assert.equal(disposed, 1);
  menu.update([item], '更多');
  menu.dispose();
  assert.equal(disposed, 2);
});
