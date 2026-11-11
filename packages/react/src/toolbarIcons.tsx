import type {
  CapabilityAction,
  ViewerConfiguration as DomConfiguration,
  ViewerHandle as DomHandle,
  ViewerOptions as DomOptions,
  ViewOptions as DomViewOptions,
  ToolbarIcon,
} from '@filumo/dom';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** React 操作直接接受宿主图标，也支持原生 DOM 图标协议。 */
export type ToolbarAction = Omit<CapabilityAction, 'icon'> & {
  icon?: ReactNode | ToolbarIcon;
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
  node: ReactNode;
  icon: ToolbarIcon;
}

/** Portal 属于现有组件树，宿主主题和 Context 随图标一起保留。 */
export function useToolbarIcons() {
  const records = useRef(new Map<string, IconRecord>());
  const mounts = useRef(
    new Map<HTMLElement, { key: number; record: IconRecord }>(),
  );
  const sequence = useRef(0);
  const alive = useRef(true);
  const [, refresh] = useState(0);
  const changed = () => {
    if (alive.current) refresh((value) => value + 1);
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      mounts.current.clear();
      records.current.clear();
    };
  }, []);
  const convert = (options: ViewerConfiguration): DomConfiguration => {
    if (options.toolbarActions === undefined)
      return options as DomConfiguration;
    const wanted = new Set<string>();
    let dirty = false;
    const toolbarActions = options.toolbarActions.map(
      (action): CapabilityAction => {
        const value = action.icon;
        if (typeof value === 'boolean') return { ...action, icon: null };
        if (
          value === undefined ||
          value === null ||
          (typeof value === 'object' && 'mount' in value)
        ) {
          return { ...action, icon: value as ToolbarIcon | null | undefined };
        }
        wanted.add(action.id);
        let record = records.current.get(action.id);
        if (!record) {
          const created: IconRecord = {
            node: value,
            icon: {
              mount(container) {
                mounts.current.set(container, {
                  key: ++sequence.current,
                  record: created,
                });
                changed();
                return {
                  dispose() {
                    if (mounts.current.delete(container)) changed();
                  },
                };
              },
            },
          };
          records.current.set(action.id, created);
          record = created;
        } else if (record.node !== value) {
          record.node = value;
          dirty = true;
        }
        return { ...action, icon: record.icon };
      },
    );
    for (const id of records.current.keys())
      if (!wanted.has(id)) records.current.delete(id);
    if (dirty) changed();
    return { ...options, toolbarActions };
  };
  return {
    convert,
    render: () =>
      [...mounts.current].map(([container, { key, record }]) =>
        createPortal(record.node, container, String(key)),
      ),
  };
}
