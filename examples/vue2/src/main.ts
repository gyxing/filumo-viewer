import { DocumentViewer } from '@fivo/vue2';
import Vue from 'vue';
import {
  events,
  options,
  plugins,
  setActivation,
  setupDemo,
} from '../../shared/demo';
const app = new Vue({
  data: () => ({ active: true }),
  render(h) {
    return h('keep-alive', [
      this.active
        ? h(DocumentViewer, {
            key: 'document',
            ref: 'viewer',
            props: { plugins, options },
            on: { ready: events.onReady, error: events.onError },
          })
        : null,
    ]);
  },
}).$mount('#viewer');
setupDemo(() => app.$refs.viewer as any);
setActivation(async (value) => {
  app.active = value;
  await Vue.nextTick();
});
window.addEventListener('pagehide', () => app.$destroy(), { once: true });
