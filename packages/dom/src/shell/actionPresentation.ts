import type { CapabilityAction } from '../capabilities/types';
import type { ShellIcon } from './icons';

// 主栏与菜单共用语义图标，同一操作在不同格式中保持一致。
const ACTION_ICONS: Readonly<Partial<Record<string, ShellIcon>>> = {
  open: 'open',
  search: 'search',
  outline: 'outline',
  review: 'review',
  notes: 'notes',
  encoding: 'encoding',
  mode: 'view',
  sheetMode: 'view',
  revision: 'review',
  wrap: 'wrap',
  lines: 'lines',
  branch: 'branch',
  path: 'path',
  sheet: 'sheet',
  zoomMode: 'view',
  transitions: 'transitions',
  rotate: 'rotate',
  reset: 'reset',
  fit: 'fit',
  actual: 'actual',
  retry: 'reset',
  thumbnails: 'thumbnails',
  previous: 'previous',
  next: 'next',
  zoomIn: 'zoomIn',
  zoomOut: 'zoomOut',
  download: 'download',
  fullscreen: 'fullscreen',
  exitFullscreen: 'exitFullscreen',
  more: 'more',
};
// 标准直接动作默认仅显示图标；面板、模式与恢复操作保留文字帮助辨认。
const ICON_ONLY_ACTIONS = new Set([
  'previous',
  'next',
  'zoomIn',
  'zoomOut',
  'rotate',
  'reset',
  'download',
  'fullscreen',
  'exitFullscreen',
  'more',
]);

/** 返回主栏采用的图标和标签策略；选择控件的标签策略不影响当前值。 */
export function getActionPresentation(
  action: Pick<CapabilityAction, 'id' | 'kind' | 'toolbar'>,
): { icon?: ShellIcon; showLabel: boolean } {
  const semantic = action.id.split('.').at(-1) ?? '';
  const icon = ACTION_ICONS[semantic];
  const showLabel =
    action.toolbar?.showLabel ??
    (!icon || (action.kind !== 'select' && !ICON_ONLY_ACTIONS.has(semantic)));
  // 没有图标的普通按钮始终保留名称，避免显式隐藏文字后成为空白按钮。
  return {
    icon,
    showLabel: !icon && action.kind !== 'select' ? true : showLabel,
  };
}
