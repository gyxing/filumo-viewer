import type { ViewerConfiguration } from '@fivo/dom';
import type { OfficeOptions } from '@fivo/office';
import type { WebsiteLocale } from './home-content';
export interface PlaygroundConfig {
  viewer: ViewerConfiguration;
  office: OfficeOptions;
}
/** 每次恢复参数都返回独立对象；默认值与公开查看器保持一致。 */
export function createPlaygroundConfig(
  locale: WebsiteLocale,
): PlaygroundConfig {
  return {
    viewer: { height: 640, zoom: 100, theme: 'light', locale, toolbar: true },
    office: { worker: 'auto', media: false },
  };
}
