import type { ViewerConfiguration } from '@filumo/dom';
import type { OfficeOptions } from '@filumo/office';
import type { PdfOptions } from '@filumo/pdf';
import type { WebsiteLocale } from './home-content';
export interface PlaygroundConfig {
  viewer: ViewerConfiguration;
  office: OfficeOptions;
  pdf: PdfOptions;
}
/** 恢复体验参数时返回独立对象，PDF 使用包内部的默认资源入口。 */
export function createPlaygroundConfig(
  locale: WebsiteLocale,
): PlaygroundConfig {
  return {
    viewer: { height: 640, zoom: 100, theme: 'light', locale, toolbar: true },
    office: { worker: 'auto', media: false },
    pdf: {},
  };
}
