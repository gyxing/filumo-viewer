import type { ViewerCapabilities } from '../../../packages/dom/src';
import '../../../packages/dom/src/shell.less';
import { bindCapabilities } from '../../../packages/dom/src/shell/bindCapabilities';
import { labelShellButton } from '../../../packages/dom/src/shell/icons';
import { createOfficeCapabilities } from '../../../packages/office/src/runtime/capabilities';
import { createOfficeInteractions } from '../../../packages/office/src/runtime/createOfficeInteractions';

const params = new URLSearchParams(location.search);
const en = params.get('locale') === 'en-US';
const host = document.getElementById('preview')!;
host.style.width = (Number(params.get('width')) || 1100) + 'px';
const root = document.createElement('section');
root.className = 'fivo-viewer';
root.dataset.theme = params.get('theme') || 'light';
const toolbar = document.createElement('div');
toolbar.className = 'fivo-toolbar';
toolbar.setAttribute('role', 'toolbar');
const title = document.createElement('div');
title.className = 'fivo-file-title';
title.textContent = '格式工具栏回归.docx';
const open = document.createElement('button');
open.className = 'fivo-open-file';
labelShellButton(open, en ? 'Open file' : '打开文件', 'open');
const controls = document.createElement('div');
controls.className = 'fivo-controls';
toolbar.append(title, open, controls);
for (const [label, icon] of [
  ['下载原文件', 'download'],
  ['全屏', 'fullscreen'],
] as const) {
  const button = document.createElement('button');
  labelShellButton(button, label, icon, true);
  toolbar.append(button);
}
root.append(toolbar);
host.append(root);
const result = document.getElementById('result')!;
const bindings = bindCapabilities(controls, (error) => {
  document.body.dataset.error = String(error);
});
let port = createOfficeInteractions('docx');
let stop = () => {};
let legacy = false;
let legacyZoom = 100;
let legacyIndex = 0;
let calls = 0;
const refresh = () => {
  const generic: ViewerCapabilities = {
    zoom: {
      value: legacyZoom,
      min: 1,
      max: 500,
      step: 0.5,
      set: async (value) => {
        legacyZoom = value;
        calls++;
        refresh();
      },
    },
    navigation: {
      index: legacyIndex,
      count: 3,
      goTo: async (index) => {
        legacyIndex = index;
        refresh();
      },
    },
    actions: [
      {
        id: 'custom.action',
        kind: 'action',
        label: '自定义动作',
        run() {
          calls++;
          refresh();
        },
      },
    ],
  };
  bindings.update(
    legacy ? generic : createOfficeCapabilities(port, en ? 'en-US' : 'zh-CN'),
    en ? 'en-US' : 'zh-CN',
  );
  result.textContent = JSON.stringify({
    ...port.getState(),
    calls,
    legacyZoom,
    legacyIndex,
  });
};
const choose = (kind: string) => {
  legacy = false;
  stop();
  port.dispose();
  port = createOfficeInteractions(kind);
  port.bind({ navigatePage() {} });
  port.updateDocument({
    pageCount: 3,
    slideCount: 2,
    sheets: [
      { id: 'one', name: 'One' },
      { id: 'two', name: 'Two' },
    ],
  });
  stop = port.subscribe(refresh);
  refresh();
};
// 内容更新直接进入真实交互状态，DOM 展示和操作均使用生产能力绑定。
for (const [label, action] of [
  ['Word', () => choose('docx')],
  ['Excel', () => choose('xlsx')],
  ['PPT', () => choose('pptx')],
  [
    '内容',
    () => {
      port.updateDocument({ outlineCount: 2 });
      port.updateAnnotations(1, { noteCount: 1, supportsRevisionModes: true });
    },
  ],
  [
    '空内容',
    () => {
      port.updateDocument({ outlineCount: 0 });
      port.updateAnnotations(0);
    },
  ],
  ['单页', () => port.updateDocument({ slideCount: 1 })],
  ['异步刷新', () => refresh()],
  [
    '通用',
    () => {
      legacy = true;
      refresh();
    },
  ],
  [
    '销毁工具栏',
    () => {
      stop();
      port.dispose();
      bindings.dispose();
      root.remove();
    },
  ],
] as const) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.onclick = action;
  host.before(button);
}
choose('docx');
document.body.dataset.ready = 'true';
