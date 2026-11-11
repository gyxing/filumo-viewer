import { FilumoError } from '@filumo/core';
import type { ViewOptions, ZoomMode } from './contracts';

/** 格式视图共用配置优先级与校验，缩放计算仍由各格式的真实尺寸决定。 */
export function resolveZoomOptions(
  options: Pick<ViewOptions, 'zoom' | 'zoomMode' | 'fitMaxZoom'>,
  defaults: { mode: ZoomMode; modes: readonly ZoomMode[]; minFitZoom: number },
): { mode: ZoomMode; zoom: number; fitMaxZoom?: number } {
  const mode =
    options.zoomMode ??
    (options.zoom === undefined ? defaults.mode : 'percentage');
  if (!defaults.modes.includes(mode))
    throw new FilumoError('INVALID_ZOOM_MODE', '当前格式不支持该缩放模式');
  const zoom = options.zoom ?? 100;
  if (!Number.isFinite(zoom) || zoom <= 0)
    throw new FilumoError('INVALID_ZOOM', '缩放比例必须为有限正数');
  const fitMaxZoom = options.fitMaxZoom;
  if (
    fitMaxZoom !== undefined &&
    (!Number.isFinite(fitMaxZoom) || fitMaxZoom < defaults.minFitZoom)
  )
    throw new FilumoError(
      'INVALID_ZOOM',
      `自动缩放上限必须为至少${defaults.minFitZoom}%的有限数值`,
    );
  return { mode, zoom, fitMaxZoom };
}
