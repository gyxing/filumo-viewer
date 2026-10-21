import type { DocumentInput, DocumentOpenOptions } from '@filumo/core';
import { notify } from '@filumo/core';
import type {
  ViewOptions,
  ViewerConfiguration,
  ViewerHandle,
  ViewerPlugin,
} from '@filumo/dom';
import { createViewer } from '@filumo/dom';
import type { PropType } from 'vue';
import Vue from 'vue';

interface InstanceState {
  viewer?: ViewerHandle;
  generation: number;
  closed: boolean;
  active: boolean;
  configurationKey?: string;
  listeners: Set<() => void>;
  capabilityListeners: Set<() => void>;
}
// 运行时对象不进入 Vue 2 的深度响应式系统，也不在组件实例间共享。
const states = new WeakMap<object, InstanceState>();
function getState(instance: object): InstanceState {
  let state = states.get(instance);
  if (!state) {
    state = {
      generation: 0,
      closed: false,
      active: true,
      listeners: new Set(),
      capabilityListeners: new Set(),
    };
    states.set(instance, state);
  }
  return state;
}
/** Vue 2 使用 Options API 适配同一 DOM 查看器，兼容 2.6/2.7。 */
export const DocumentViewer = Vue.extend({
  name: 'FilumoDocumentViewer',
  props: {
    source: {
      type: null as unknown as PropType<DocumentInput>,
      default: undefined,
    },
    plugins: { type: Array, required: true },
    options: {
      type: Object as PropType<ViewerConfiguration>,
      default: (): ViewerConfiguration => ({}),
    },
  },
  mounted() {
    void this.mountViewer().catch((error: unknown) =>
      this.$emit('error', error),
    );
  },
  activated() {
    const state = getState(this);
    state.active = true;
    state.viewer?.setActive(true);
  },
  deactivated() {
    const state = getState(this);
    state.active = false;
    state.viewer?.setActive(false);
  },
  beforeDestroy() {
    const state = getState(this);
    state.closed = true;
    state.listeners.clear();
    state.capabilityListeners.clear();
    state.generation++;
    void state.viewer
      ?.destroy()
      .catch((error: unknown) => this.$emit('error', error));
    state.viewer = undefined;
  },
  watch: {
    source(value: DocumentInput | undefined) {
      if (value !== undefined)
        void getState(this)
          .viewer?.open(value)
          .catch(() => undefined);
    },
    plugins() {
      if (this.$el)
        void this.mountViewer().catch((error: unknown) =>
          this.$emit('error', error),
        );
    },
    options: {
      deep: true,
      handler(value: ViewerConfiguration) {
        const state = getState(this);
        const key = JSON.stringify([
          value.pluginId,
          value.resourcePolicy,
          value.stylePolicy,
        ]);
        if (state.viewer && state.configurationKey !== key) {
          void this.mountViewer().catch((error: unknown) =>
            this.$emit('error', error),
          );
          return;
        }
        state.viewer?.update(value);
      },
    },
  },
  methods: {
    async mountViewer() {
      const state = getState(this);
      const task = ++state.generation;
      const previous = state.viewer;
      state.viewer = undefined;
      await previous?.destroy();
      if (state.closed || state.generation !== task) return;
      state.configurationKey = JSON.stringify([
        this.options.pluginId,
        this.options.resourcePolicy,
        this.options.stylePolicy,
      ]);
      const viewer = createViewer(this.$el as HTMLElement, {
        ...this.options,
        plugins: this.plugins as ViewerPlugin[],
        onReady: (session) => this.$emit('ready', session),
        onCapabilitiesChange: (capabilities) => {
          if (!state.closed) {
            notify(state.capabilityListeners);
            this.$emit('capabilitiesChange', capabilities);
          }
        },
        onError: (error) => this.$emit('error', error),
        onStateChange: (snapshot) => {
          if (!state.closed) {
            notify(state.listeners);
            this.$emit('stateChange', snapshot);
          }
        },
      });
      state.viewer = viewer;
      viewer.setActive(state.active);
      if (this.source !== undefined)
        await viewer.open(this.source as DocumentInput).catch(() => undefined);
    },
    open(input: DocumentInput, selection?: DocumentOpenOptions) {
      return (
        getState(this).viewer?.open(input, selection) ??
        Promise.reject(new Error('查看器尚未挂载'))
      );
    },
    update(options: ViewOptions) {
      getState(this).viewer?.update(options);
    },
    getSnapshot() {
      return (
        getState(this).viewer?.getSnapshot() ?? { status: 'idle' as const }
      );
    },
    subscribe(listener: () => void) {
      const state = getState(this);
      state.listeners.add(listener);
      return () => {
        state.listeners.delete(listener);
      };
    },
    getCapabilities() {
      return getState(this).viewer?.getCapabilities() ?? {};
    },
    subscribeCapabilities(listener: () => void) {
      const state = getState(this);
      state.capabilityListeners.add(listener);
      return () => {
        state.capabilityListeners.delete(listener);
      };
    },
    setActive(active: boolean) {
      const state = getState(this);
      state.active = active;
      state.viewer?.setActive(active);
    },
    destroy() {
      return getState(this).viewer?.destroy() ?? Promise.resolve();
    },
  },
  render(h) {
    return h('div');
  },
});
