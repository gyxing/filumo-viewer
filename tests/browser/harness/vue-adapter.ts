import { createSession } from '@filumo/core';
import type { ViewerConfiguration, ViewerPlugin } from '@filumo/dom';
import { DocumentViewer } from '@filumo/vue';
import { createApp, h, ref } from 'vue';

const options = ref<ViewerConfiguration>({
  theme: 'light',
  resourcePolicy: { maxFileBytes: 1000 },
});
const metrics = { ready: 0, updates: 0, disposed: 0 };
const source = new Uint8Array([1]);
const plugins: ViewerPlugin[] = [
  {
    document: {
      id: 'fixture',
      protocolVersion: 1,
      extensions: [],
      mimeTypes: [],
      detect: async () => true,
      load: async () => ({
        open: async (input, context) =>
          createSession({
            ...context,
            source: input,
            format: 'fixture',
            data: {},
          }),
      }),
    },
    loadView: async () => ({
      mount: async () => ({
        update() {
          metrics.updates++;
        },
        setActive() {},
        dispose() {
          metrics.disposed++;
        },
      }),
    }),
  },
];
// 使用真实深层响应式变更观察更新与重建是否被同一配置重复触发。
const app = createApp({
  setup: () => () =>
    h(DocumentViewer, {
      plugins,
      source,
      options: options.value,
      onReady() {
        metrics.ready++;
      },
    }),
});
const container = document.createElement('div');
document.body.append(container);
app.mount(container);
Object.assign(window, {
  filumoAdapter: {
    metrics: () => ({ ...metrics }),
    rebuild() {
      options.value.resourcePolicy!.maxFileBytes = 2000;
    },
    update() {
      options.value.theme = 'dark';
    },
    dispose: () => app.unmount(),
  },
});
