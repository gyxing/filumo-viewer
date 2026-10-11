import type { SmokeConfig } from './types';
export const initialConfig: SmokeConfig = {
  viewer: {
    height: 640,
    theme: 'light',
    locale: 'zh-CN',
    zoom: 100,
    toolbar: true,
  },
  office: { worker: 'auto', media: false },
  toolbarMode: 'default',
};
/** 无法在公开 API 中成立的旧配置不伪造兼容字段。 */
export function changeView(
  config: SmokeConfig,
  patch: Partial<SmokeConfig['viewer']>,
): SmokeConfig {
  return { ...config, viewer: { ...config.viewer, ...patch } };
}
export function redact(value: unknown) {
  return String(value instanceof Error ? value.message : value)
    .replace(
      /(authorization|token|password|access_token)=?[^&\s]*/gi,
      '$1=[已隐藏]',
    )
    .slice(0, 1000);
}
