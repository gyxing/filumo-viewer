import type { DocumentInput, DocumentOpenOptions } from '@filumo/core';
import { notify } from '@filumo/core';
import type { ViewerHandle, ViewerPlugin } from '@filumo/dom';
import { createViewer } from '@filumo/dom';
import type { PropType } from 'vue';
import {
  Fragment,
  defineComponent,
  h,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  shallowRef,
  watch,
} from 'vue';
import type { ViewOptions, ViewerConfiguration } from './toolbarIcons';
import { createToolbarIcons } from './toolbarIcons';

/** 使用 Composition API 与渲染函数提供薄适配，不要求宿主添加 SFC 编译插件。 */
export const DocumentViewer = defineComponent({
  name: 'FilumoDocumentViewer',
  inheritAttrs: false,
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
  setup(props, { emit, expose, attrs }) {
    const host = shallowRef<HTMLElement>();
    const icons = createToolbarIcons();
    const listeners = new Set<() => void>();
    const capabilityListeners = new Set<() => void>();
    let viewer: ViewerHandle | undefined;
    let generation = 0;
    let closed = false;
    let active = true;
    let configurationKey: string | undefined;
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
      configurationKey = JSON.stringify([
        props.options.pluginId,
        props.options.resourcePolicy,
        props.options.stylePolicy,
      ]);
      viewer = createViewer(host.value, {
        ...icons.convert(props.options),
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
      (options) => {
        // 资源与样式策略属于创建配置，一次变化只重建，不先更新将要销毁的视图。
        const key = JSON.stringify([
          options.pluginId,
          options.resourcePolicy,
          options.stylePolicy,
        ]);
        if (key !== configurationKey) void rebuild().catch(report);
        else viewer?.update(icons.convert(options));
      },
      { deep: true },
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
      update: (options: ViewOptions) => viewer?.update(icons.convert(options)),
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
    return () =>
      h(Fragment, [h('div', { ...attrs, ref: host }), ...icons.render()]);
  },
});
