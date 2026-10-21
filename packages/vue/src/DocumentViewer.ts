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
import {
  defineComponent,
  h,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  shallowRef,
  watch,
} from 'vue';

/** 使用 Composition API 与渲染函数提供薄适配，不要求宿主添加 SFC 编译插件。 */
export const DocumentViewer = defineComponent({
  name: 'FilumoDocumentViewer',
  props: {
    source: { type: null as unknown as PropType<DocumentInput> },
    plugins: {
      type: Array as PropType<readonly ViewerPlugin[]>,
      required: true,
    },
    options: {
      type: Object as PropType<ViewerConfiguration>,
      default: () => ({}),
    },
  },
  emits: ['ready', 'error', 'stateChange', 'capabilitiesChange'],
  setup(props, { emit, expose }) {
    const host = shallowRef<HTMLElement>();
    const listeners = new Set<() => void>();
    const capabilityListeners = new Set<() => void>();
    let viewer: ViewerHandle | undefined;
    let generation = 0;
    let closed = false;
    let active = true;
    const report = (error: unknown) => {
      if (!(error instanceof Error && error.name === 'AbortError'))
        emit('error', error);
    };
    const rebuild = async () => {
      const task = ++generation;
      const old = viewer;
      viewer = undefined;
      await old?.destroy();
      if (closed || task !== generation || !host.value) return;
      viewer = createViewer(host.value, {
        ...props.options,
        plugins: props.plugins,
        onReady: (session) => emit('ready', session),
        onCapabilitiesChange: (capabilities) => {
          if (!closed) {
            notify(capabilityListeners);
            emit('capabilitiesChange', capabilities);
          }
        },
        onError: report,
        onStateChange: (state) => {
          if (!closed) {
            notify(listeners);
            emit('stateChange', state);
          }
        },
      });
      viewer.setActive(active);
      if (props.source !== undefined)
        await viewer.open(props.source).catch(() => undefined);
    };
    onMounted(() => {
      void rebuild().catch(report);
    });
    watch(
      () => props.plugins,
      () => {
        void rebuild().catch(report);
      },
    );
    watch(
      () => props.source,
      (source) => {
        if (source !== undefined)
          void viewer?.open(source).catch(() => undefined);
      },
    );
    watch(
      () => props.options,
      (options) => viewer?.update(options),
      { deep: true },
    );
    watch(
      () =>
        JSON.stringify([
          props.options.pluginId,
          props.options.resourcePolicy,
          props.options.stylePolicy,
        ]),
      () => {
        void rebuild().catch(report);
      },
    );
    onActivated(() => {
      active = true;
      viewer?.setActive(true);
    });
    onDeactivated(() => {
      active = false;
      viewer?.setActive(false);
    });
    onBeforeUnmount(() => {
      closed = true;
      listeners.clear();
      capabilityListeners.clear();
      generation++;
      void viewer?.destroy().catch(report);
      viewer = undefined;
    });
    expose({
      open: (source: DocumentInput, selection?: DocumentOpenOptions) =>
        viewer?.open(source, selection) ??
        Promise.reject(new Error('查看器尚未挂载')),
      update: (options: ViewOptions) => viewer?.update(options),
      getSnapshot: () => viewer?.getSnapshot() ?? { status: 'idle' as const },
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      getCapabilities: () => viewer?.getCapabilities() ?? {},
      subscribeCapabilities: (listener: () => void) => {
        capabilityListeners.add(listener);
        return () => {
          capabilityListeners.delete(listener);
        };
      },
      setActive: (value: boolean) => {
        active = value;
        viewer?.setActive(value);
      },
      destroy: () => viewer?.destroy() ?? Promise.resolve(),
    });
    return () => h('div', { ref: host });
  },
});
