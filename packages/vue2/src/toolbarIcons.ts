import type {
  CapabilityAction,
  ViewerConfiguration as DomConfiguration,
  ViewerHandle as DomHandle,
  ViewerOptions as DomOptions,
  ViewOptions as DomViewOptions,
  ToolbarIcon,
  ToolbarIconContext,
} from '@filumo/dom';
import type { CreateElement, VNode } from 'vue';
import Vue from 'vue';

/** Vue 2 每个位置独立调用渲染函数，支持组件、SVG 和图标字体。 */
export type ToolbarIconRenderer = (
  h: CreateElement,
  context: ToolbarIconContext,
) => VNode | null;
export type ToolbarAction = Omit<CapabilityAction, 'icon'> & {
  icon?: ToolbarIconRenderer | ToolbarIcon | null;
};
export type ViewOptions = Omit<DomViewOptions, 'toolbarActions'> & {
  toolbarActions?: readonly ToolbarAction[];
};
export type ViewerConfiguration = Omit<DomConfiguration, 'toolbarActions'> &
  ViewOptions;
export type ViewerOptions = Omit<DomOptions, 'toolbarActions'> & ViewOptions;
export type ViewerHandle = Omit<DomHandle, 'update'> & {
  update(options: ViewOptions): void;
};

interface IconRecord {
  render: ToolbarIconRenderer;
  icon: ToolbarIcon;
  children: Set<Vue>;
}

/** 子组件关联查看器实例，继承宿主注入并通过生命周期释放渲染资源。 */
export function createToolbarIcons(owner: Vue) {
  const records = new Map<string, IconRecord>();
  const children = new Set<Vue>();
  const convert = (options: ViewerConfiguration): DomConfiguration => {
    if (options.toolbarActions === undefined)
      return options as DomConfiguration;
    const wanted = new Set<string>();
    const toolbarActions = options.toolbarActions.map(
      (action): CapabilityAction => {
        if (typeof action.icon !== 'function')
          return { ...action, icon: action.icon };
        wanted.add(action.id);
        let record = records.get(action.id);
        if (!record) {
          const created: IconRecord = {
            render: action.icon,
            children: new Set(),
            icon: {
              mount(container, context) {
                let current = context;
                const child = new Vue({
                  parent: owner,
                  render: (h) => created.render(h, current) ?? h('span'),
                });
                try {
                  child.$mount();
                  container.appendChild(child.$el);
                } catch (error) {
                  child.$destroy();
                  child.$el?.parentNode?.removeChild(child.$el);
                  throw error;
                }
                children.add(child);
                created.children.add(child);
                return {
                  update(next) {
                    current = next;
                    child.$forceUpdate();
                  },
                  dispose() {
                    created.children.delete(child);
                    if (children.delete(child)) child.$destroy();
                    child.$el.parentNode?.removeChild(child.$el);
                  },
                };
              },
            },
          };
          records.set(action.id, created);
          record = created;
        } else if (record.render !== action.icon) {
          record.render = action.icon;
          for (const child of record.children) child.$forceUpdate();
        }
        return { ...action, icon: record.icon };
      },
    );
    for (const id of records.keys()) if (!wanted.has(id)) records.delete(id);
    return { ...options, toolbarActions };
  };
  return {
    convert,
    dispose() {
      for (const child of children) {
        child.$destroy();
        child.$el.parentNode?.removeChild(child.$el);
      }
      children.clear();
      records.clear();
    },
  };
}
