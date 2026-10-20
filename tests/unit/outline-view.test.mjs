import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocument } from './helpers/reading-dom.mjs';

const output = await build({
  stdin: {
    contents:
      "export * from './packages/dom/src/outline'; export {registerStyle} from './packages/dom/src/styles'; export {PACKAGE_VERSION} from './packages/dom/src/generated/package';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  loader: { '.less': 'empty' },
});
const { OutlineTree, registerStyle, PACKAGE_VERSION } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(output.outputFiles[0].text).toString('base64')
);
const node = (id, children = []) => ({ id, children });
const accessors = {
  getId: (n) => n.id,
  getText: (n) => n.id,
  isLeaf: (n) => !n.children.length,
  getChildren: (n) => n.children,
};

function fixture() {
  const document = createDocument(),
    create = document.createElement;
  document.createElement = (...args) => {
    const element = create(...args);
    element.style.setProperty = (key, value) => {
      element.style[key] = value;
    };
    element.removeAttribute = (key) => element.attributes.delete(key);
    element.sheet = {};
    return element;
  };
  document.head = document.createElement('head');
  return document;
}
const press = (element, key) =>
  element.onkeydown({ key, preventDefault() {}, stopPropagation() {} });

test('树方框只展开，方向键只移动，激活一次且结构未变不重新读取整树', () => {
  const document = fixture(),
    toggles = [],
    activations = [];
  let reads = 0;
  const tree = new OutlineTree({
    document,
    accessors: {
      ...accessors,
      getText(n) {
        reads++;
        return n.id;
      },
    },
    onToggle: (...args) => toggles.push(args),
    onActivate: (id) => activations.push(id),
  });
  const snapshot = {
    roots: [node('a', [node('b')])],
    expanded: new Set(['a']),
    loading: new Set(),
    revision: 1,
    selectedId: 'a',
  };
  try {
    tree.update(snapshot);
    const row = tree.element.querySelector('[data-outline-id="a"]');
    row.children
      .find((child) => child.className === 'fivo-outline-switcher')
      .onclick({ stopPropagation() {} });
    assert.deepEqual(toggles, [['a', false]]);
    assert.deepEqual(activations, []);
    press(tree.element.querySelector('[data-outline-id="a"]'), 'ArrowDown');
    press(tree.element.querySelector('[data-outline-id="b"]'), 'Enter');
    assert.deepEqual(activations, ['b']);
    tree.update({ ...snapshot, selectedId: 'b' });
    assert.equal(reads, 2);
  } finally {
    tree.dispose();
  }
});

test('公共树多个实例分别持有样式租约，保留 nonce，external 模式校验版本', () => {
  registerStyle(
    'dom',
    'outline-view-fixture',
    '.fivo-outline-tree{color:inherit}',
  );
  const document = fixture();
  const options = {
    document,
    accessors,
    onToggle() {},
    onActivate() {},
    stylePolicy: { nonce: 'fixture-nonce' },
  };
  const first = new OutlineTree(options),
    second = new OutlineTree(options);
  assert.equal(document.head.children.length, 1);
  assert.equal(document.head.children[0].nonce, 'fixture-nonce');
  first.dispose();
  assert.equal(document.head.children.length, 1);
  second.dispose();
  assert.equal(document.head.children.length, 0);
  document.documentElement = {};
  document.defaultView = {
    getComputedStyle: () => ({ getPropertyValue: () => 'old-version' }),
  };
  assert.throws(
    () => new OutlineTree({ ...options, stylePolicy: { mode: 'external' } }),
    /样式/,
  );
  document.defaultView.getComputedStyle = () => ({
    getPropertyValue: () => PACKAGE_VERSION,
  });
  const external = new OutlineTree({
    ...options,
    stylePolicy: { mode: 'external' },
  });
  assert.equal(document.head.children.length, 0);
  external.dispose();
});

test('折叠祖先恢复可见焦点，树外选择更新不抢焦点，窗口行有界', () => {
  const document = fixture(),
    tree = new OutlineTree({
      document,
      accessors,
      onToggle() {},
      onActivate() {},
    });
  const roots = [
    node('a', [node('b', [node('c')])]),
    ...Array.from({ length: 1000 }, (_, i) => node('n' + i)),
  ];
  try {
    tree.element.clientHeight = 56;
    tree.update({
      roots,
      expanded: new Set(['a', 'b']),
      loading: new Set(),
      revision: 1,
    });
    tree.reveal('c', { focus: true });
    tree.update({
      roots,
      expanded: new Set(),
      loading: new Set(),
      revision: 2,
    });
    assert.equal(document.activeElement.dataset.outlineId, 'a');
    const outside = document.createElement('button');
    outside.focus();
    tree.update({
      roots,
      expanded: new Set(),
      loading: new Set(),
      revision: 2,
      selectedId: 'n500',
    });
    assert.equal(document.activeElement, outside);
    tree.reveal('n999');
    assert.ok(tree.element.children[0].children.length <= 19);
    tree.setActive(false);
    tree.setActive(true);
    tree.dispose();
    tree.dispose();
  } finally {
    tree.dispose();
  }
});

test('公共树停用取消窗口帧和尺寸观察，恢复与重复销毁不留下活动任务', () => {
  const document = fixture(),
    frames = new Map(),
    observed = new Set();
  let sequence = 0;
  document.defaultView = {
    requestAnimationFrame(callback) {
      frames.set(++sequence, callback);
      return sequence;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    ResizeObserver: class {
      observe(element) {
        observed.add(element);
      }
      disconnect() {
        observed.clear();
      }
    },
  };
  const tree = new OutlineTree({
    document,
    accessors,
    onToggle() {},
    onActivate() {},
  });
  tree.update({
    roots: [node('a')],
    expanded: new Set(),
    loading: new Set(),
    revision: 1,
  });
  tree.element.onscroll();
  tree.element.onscroll();
  assert.equal(frames.size, 1);
  tree.setActive(false);
  assert.equal(frames.size, 0);
  assert.equal(observed.size, 0);
  tree.setActive(true);
  assert.equal(observed.has(tree.element), true);
  tree.element.onscroll();
  tree.dispose();
  tree.dispose();
  assert.equal(frames.size, 0);
  assert.equal(observed.size, 0);
});

test('一级叶子与分支都有连接线，根主干穿过子树且首尾信息不随窗口改变', () => {
  const document = fixture(),
    tree = new OutlineTree({
      document,
      accessors,
      onToggle() {},
      onActivate() {},
    });
  const roots = [
    node('a'),
    node('b', [node('b1', [node('b11')]), node('b2')]),
    node('c'),
  ];
  const snapshot = {
    roots,
    expanded: new Set(['b', 'b1']),
    loading: new Set(),
    revision: 1,
  };
  const row = (id) =>
    tree.element.querySelector('[data-outline-id="' + id + '"]');
  const branch = (id) => row(id).querySelector('.fivo-outline-branch');
  try {
    tree.update(snapshot);
    for (const id of ['a', 'b', 'b1', 'b11', 'b2', 'c'])
      assert.ok(branch(id), id);
    // 图标靠操作区左侧放置，子级轴线与父节点横线末端重合，标题仍保持原位。
    for (const [id, expected] of [
      ['a', '6px'],
      ['b', '6px'],
      ['b1', '22px'],
      ['b11', '38px'],
      ['b2', '22px'],
      ['c', '6px'],
    ])
      assert.equal(branch(id).style.left, expected, id);
    assert.equal(
      row('b').querySelector('.fivo-outline-child-connector').style.left,
      branch('b1').style.left,
    );
    assert.equal(
      row('b1').querySelector('.fivo-outline-child-connector').style.left,
      branch('b11').style.left,
    );
    assert.equal(
      row('b2').querySelector('.fivo-outline-child-connector'),
      undefined,
    );
    assert.equal(branch('a').dataset.root, 'true');
    assert.equal(branch('a').dataset.first, 'true');
    assert.equal(branch('c').dataset.first, 'false');
    assert.equal(branch('c').dataset.continues, 'false');
    assert.equal(row('a').style.paddingLeft, '0px');
    assert.equal(row('b1').style.paddingLeft, '16px');
    const guides = row('b11')
      .querySelector('.fivo-outline-guides')
      .children.filter((child) => child.className === 'fivo-outline-guide');
    assert.equal(guides.length, 2);
    assert.equal(guides[0].dataset.root, 'true');
    assert.equal(guides[0].style.left, branch('b').style.left);
    tree.update({ ...snapshot, revision: 2, expanded: new Set() });
    assert.equal(row('b1'), undefined);
    assert.equal(
      row('b').querySelector('.fivo-outline-child-connector'),
      undefined,
    );
    assert.equal(branch('c').dataset.continues, 'false');
    tree.element.clientHeight = 56;
    tree.update({
      roots: Array.from({ length: 1000 }, (_, i) => node('r' + i)),
      expanded: new Set(),
      loading: new Set(),
      revision: 3,
    });
    tree.reveal('r500');
    assert.equal(branch('r500').dataset.first, 'false');
    assert.equal(branch('r500').dataset.continues, 'true');
    tree.update({
      roots: [node('only')],
      expanded: new Set(),
      loading: new Set(),
      revision: 4,
    });
    assert.equal(branch('only').dataset.first, 'true');
    assert.equal(branch('only').dataset.continues, 'false');
  } finally {
    tree.dispose();
  }
});
