import type { ViewerCapabilities } from '../capabilities/types';

// 默认比例只提供到 200%；手动输入与步进上限仍由格式能力决定。
const DEFAULT_ZOOM_PRESETS = [25, 50, 75, 100, 125, 150, 200] as const;

/** 返回当前格式可用的预设比例；显式配置优先，并去重、过滤和排序。 */
export function getZoomPresets(
  zoom: Pick<
    NonNullable<ViewerCapabilities['zoom']>,
    'min' | 'max' | 'presets'
  >,
): number[] {
  return [...new Set(zoom.presets ?? DEFAULT_ZOOM_PRESETS)]
    .filter(
      (value) =>
        Number.isFinite(value) && value >= zoom.min && value <= zoom.max,
    )
    .sort((left, right) => left - right);
}
