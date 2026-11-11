import { resolveZoomOptions, type ViewOptions } from '@filumo/dom';
import type { OfficeViewportService } from '../services/OfficeViewportService';
import type { OfficeInteractionPort } from './interactionTypes';

/** 宿主显式修改比例或模式才重新应用策略，自动上限更新保留用户当前手动比例。 */
export async function applyOfficeZoomOptions(
  options: ViewOptions,
  previous: ViewOptions | undefined,
  port: OfficeInteractionPort,
  viewport: Pick<OfficeViewportService, 'setFitMaxZoom'>,
): Promise<void> {
  const family = port.getState().family;
  const resolved = resolveZoomOptions(options, {
    mode: family === 'presentation' ? 'fit-page' : 'percentage',
    modes:
      family === 'spreadsheet'
        ? ['percentage', 'fit-width']
        : ['percentage', 'fit-width', 'fit-page'],
    minFitZoom: 25,
  });
  viewport.setFitMaxZoom(resolved.fitMaxZoom);
  if (
    previous &&
    options.zoom === previous.zoom &&
    options.zoomMode === previous.zoomMode
  )
    return;
  await port.execute(
    resolved.mode === 'percentage'
      ? { type: 'zoom', value: resolved.zoom }
      : { type: 'zoomMode', mode: resolved.mode },
  );
}
