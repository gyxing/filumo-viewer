import type {
  CapabilityAction,
  ViewerCapabilities,
} from '../capabilities/types';
import { getActionPresentation } from './actionPresentation';
import type { ShellIcon } from './icons';
import { getZoomPresets } from './zoomPresets';

export interface ToolbarMenuItem {
  id: string;
  label: string;
  value?: string;
  icon?: ShellIcon;
  kind?: 'checkbox' | 'radio';
  checked?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
  closeOnRun?: boolean;
  children?: readonly ToolbarMenuItem[];
  run?(): unknown;
}

/** 菜单与主栏使用同一份能力声明，避免复制格式状态和操作逻辑。 */
export function actionMenuItem(
  action: CapabilityAction,
  available: boolean,
): ToolbarMenuItem {
  const item: ToolbarMenuItem = {
    id: action.id,
    label: action.label,
    disabled: !available || action.enabled === false,
    // 第一级操作始终带图标；自定义能力使用通用图标，子菜单选项不受影响。
    icon: getActionPresentation(action).icon ?? 'command',
    closeOnRun: action.menu?.closeOnRun,
  };
  if (action.kind === 'select') {
    item.disabled ||= !action.options?.length;
    item.value = action.options?.find(
      (option) => option.kind !== 'action' && option.value === action.value,
    )?.label;
    item.children = action.options?.map((option): ToolbarMenuItem => {
      const command = option.kind === 'action';
      return {
        id: action.id + ':' + option.value,
        label: option.label,
        kind: command ? undefined : 'radio',
        checked: command ? undefined : option.value === action.value,
        dividerBefore: option.dividerBefore,
        closeOnRun: action.menu?.closeOnRun,
        run: () => {
          if (command || action.allowReselect || option.value !== action.value)
            return action.run(option.value);
        },
      };
    });
  } else {
    item.kind =
      (action.menu?.kind ?? action.kind) === 'toggle' ? 'checkbox' : undefined;
    item.checked = item.kind ? action.pressed : undefined;
    item.run = () => action.run();
  }
  return item;
}

/** 收纳后的缩放只提供菜单命令和比例选项，不把输入框移入浮层。 */
export function zoomMenuItem(
  zoom: NonNullable<ViewerCapabilities['zoom']>,
  en: boolean,
  available: boolean,
): ToolbarMenuItem {
  const mode = zoom.mode?.options.find(
    (option) => option.value === zoom.mode?.value,
  );
  // 与主栏共用预设，不把格式的最大输入值额外塞进下拉列表。
  const presets = getZoomPresets(zoom);
  return {
    id: 'toolbar.zoom',
    label: en ? 'Zoom' : '缩放',
    icon: 'zoomIn',
    value: mode?.label ?? zoom.value + '%',
    disabled: !available,
    dividerBefore: true,
    children: [
      {
        id: 'toolbar.zoom.in',
        label: en ? 'Zoom in' : '放大',
        icon: 'zoomIn',
        disabled: zoom.value >= zoom.max,
        run: () => zoom.set(Math.min(zoom.max, zoom.value + zoom.step)),
      },
      {
        id: 'toolbar.zoom.out',
        label: en ? 'Zoom out' : '缩小',
        icon: 'zoomOut',
        disabled: zoom.value <= zoom.min,
        run: () => zoom.set(Math.max(zoom.min, zoom.value - zoom.step)),
      },
      ...(zoom.mode?.options ?? []).map(
        (option, index): ToolbarMenuItem => ({
          id: 'toolbar.zoom.mode:' + option.value,
          label: option.label,
          kind: 'radio',
          checked: option.value === zoom.mode?.value,
          dividerBefore: index === 0,
          run: () => zoom.mode?.set(option.value),
        }),
      ),
      ...presets.map(
        (value, index): ToolbarMenuItem => ({
          id: 'toolbar.zoom.value:' + value,
          label: value + '%',
          kind: 'radio',
          checked: !mode && zoom.value === value,
          dividerBefore: index === 0,
          run: () => zoom.set(value),
        }),
      ),
    ],
  };
}

/** 翻页在窄窗口中转换为菜单命令，避免把页码输入留在菜单里。 */
export function navigationMenuItem(
  nav: NonNullable<ViewerCapabilities['navigation']>,
  en: boolean,
  available: boolean,
): ToolbarMenuItem {
  return {
    id: 'toolbar.navigation',
    label: en ? 'Navigation' : '翻页',
    icon: 'document',
    value: nav.index + 1 + ' / ' + nav.count,
    disabled: !available,
    dividerBefore: true,
    children: [
      {
        id: 'toolbar.navigation.previous',
        label: nav.toolbar?.previousLabel ?? (en ? 'Previous' : '上一页'),
        icon: 'previous',
        disabled: nav.index <= 0,
        run: () => nav.goTo(nav.index - 1),
      },
      {
        id: 'toolbar.navigation.next',
        label: nav.toolbar?.nextLabel ?? (en ? 'Next' : '下一页'),
        icon: 'next',
        disabled: nav.index >= nav.count - 1,
        run: () => nav.goTo(nav.index + 1),
      },
      {
        id: 'toolbar.navigation.first',
        label: en ? 'First page' : '首页',
        dividerBefore: true,
        disabled: nav.index <= 0,
        run: () => nav.goTo(0),
      },
      {
        id: 'toolbar.navigation.last',
        label: en ? 'Last page' : '末页',
        disabled: nav.index >= nav.count - 1,
        run: () => nav.goTo(nav.count - 1),
      },
    ],
  };
}
