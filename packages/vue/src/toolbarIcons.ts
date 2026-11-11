import type {
  CapabilityAction,
  ViewerConfiguration as DomConfiguration,
  ViewerHandle as DomHandle,
  ViewerOptions as DomOptions,
  ViewOptions as DomViewOptions,
  ToolbarIcon,
  ToolbarIconContext,
} from '@filumo/dom';
import type { VNodeChild } from 'vue';
import { Teleport, h, onBeforeUnmount, shallowRef, triggerRef } from 'vue';

/** 每次渲染分别创建 VNode，保留宿主响应式依赖和应用上下文。 */
export type ToolbarIconRenderer = (context: ToolbarIconContext) => VNodeChild;
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
}

/** Teleport 随查看器组件渲染，避免创建脱离宿主应用的图标应用。 */
export function createToolbarIcons() {
  const records = new Map<string, IconRecord>();
  const mounts = shallowRef(
    new Map<
      HTMLElement,
      {
        key: number;
        record: IconRecord;
        context: ToolbarIconContext;
      }
    >(),
  );
  let sequence = 0;
  let alive = true;
  const changed = () => {
    if (alive) triggerRef(mounts);
  };
  onBeforeUnmount(() => {
    alive = false;
    mounts.value.clear();
    records.clear();
  });
  const convert = (options: ViewerConfiguration): DomConfiguration => {
    if (options.toolbarActions === undefined)
      return options as DomConfiguration;
    const wanted = new Set<string>();
    let dirty = false;
    const toolbarActions = options.toolbarActions.map(
      (action): CapabilityAction => {
        if (typeof action.icon !== 'function')
          return { ...action, icon: action.icon };
        wanted.add(action.id);
        let record = records.get(action.id);
        if (!record) {
          const created: IconRecord = {
            render: action.icon,
            icon: {
              mount(container, context) {
                const entry = { key: ++sequence, record: created, context };
                mounts.value.set(container, entry);
                changed();
                return {
                  update(next) {
                    entry.context = next;
                    changed();
                  },
                  dispose() {
                    if (mounts.value.delete(container)) changed();
                  },
                };
              },
            },
          };
          records.set(action.id, created);
          record = created;
        } else if (record.render !== action.icon) {
          record.render = action.icon;
          dirty = true;
        }
        return { ...action, icon: record.icon };
      },
    );
    for (const id of records.keys()) if (!wanted.has(id)) records.delete(id);
    if (dirty) changed();
    return { ...options, toolbarActions };
  };
  return {
    convert,
    render: () =>
      [...mounts.value].map(([container, entry]) =>
        h(Teleport, { to: container, key: entry.key }, [
          entry.record.render(entry.context),
        ]),
      ),
  };
}
