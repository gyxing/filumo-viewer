import { DocumentViewer } from '@filumo/vue';
import { KeepAlive, createApp, h, nextTick, shallowRef } from 'vue';
import {
  events,
  options,
  plugins,
  setActivation,
  setupDemo,
} from '../../shared/demo';
const viewer = shallowRef();
const active = shallowRef(true);
const app = createApp({
  setup: () => () =>
    h(KeepAlive, {}, () =>
      active.value
        ? h(DocumentViewer, {
            key: 'document',
            ref: viewer,
            plugins,
            options,
            ...events,
          })
        : null,
    ),
});
app.mount('#viewer');
setupDemo(() => viewer.value);
setActivation(async (value) => {
  active.value = value;
  await nextTick();
});
window.addEventListener('pagehide', () => app.unmount(), { once: true });
