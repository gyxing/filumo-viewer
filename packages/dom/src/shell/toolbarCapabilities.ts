import type {
  CapabilityAction,
  ViewerCapabilities,
} from '../capabilities/types';

/** 只比较呈现数据，回调引用变化不触发能力通知，避免框架受控更新形成循环。 */
export function toolbarConfigurationKey(
  actions?: readonly CapabilityAction[],
  visibility?: Readonly<Record<string, boolean>>,
): string {
  return JSON.stringify([
    actions,
    Object.entries(visibility ?? {}).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  ]);
}

/** 宿主同 ID 操作覆盖格式默认项，显隐仅投影到展示层，原始能力保持可调用。 */
export function toolbarCapabilities(
  capabilities: ViewerCapabilities,
  hostActions?: readonly CapabilityAction[],
  visibility?: Readonly<Record<string, boolean>>,
): ViewerCapabilities {
  if (!hostActions?.length && !visibility) return capabilities;
  const actions = new Map(
    [...(capabilities.actions ?? []), ...(hostActions ?? [])].map((action) => [
      action.id,
      action,
    ]),
  );
  return {
    ...capabilities,
    actions: [...actions.values()].map((action) => {
      const semantic = action.id.split('.').at(-1) ?? action.id;
      const visible = visibility?.[action.id] ?? visibility?.[semantic];
      return visible === undefined
        ? action
        : { ...action, toolbar: { ...action.toolbar, visible } };
    }),
    navigation:
      capabilities.navigation && visibility?.navigation !== undefined
        ? {
            ...capabilities.navigation,
            toolbar: {
              ...capabilities.navigation.toolbar,
              visible: visibility.navigation,
            },
          }
        : capabilities.navigation,
    zoom:
      capabilities.zoom && visibility?.zoom !== undefined
        ? {
            ...capabilities.zoom,
            toolbar: { ...capabilities.zoom.toolbar, visible: visibility.zoom },
          }
        : capabilities.zoom,
  };
}
