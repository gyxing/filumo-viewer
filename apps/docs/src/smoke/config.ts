import type { SmokeConfig } from './types';
export const initialConfig: SmokeConfig = {
  // 不指定固定比例，以检查各格式的默认缩放，PowerPoint 默认按容器适应页面。
  viewer: {
    height: 640,
    theme: 'light',
    locale: 'zh-CN',
    toolbar: true,
  },
  office: { worker: 'auto', media: false },
  text: { worker: 'auto' },
  json: { worker: 'auto', initialMode: 'tree' },
  markdown: { worker: 'auto', initialMode: 'reading', highlight: true },
  toolbarMode: 'default',
};
/** 恢复参数时创建独立副本，不清除用户当前的文件来源。 */
export function resetSmokeConfig(): SmokeConfig {
  return {
    ...initialConfig,
    viewer: { ...initialConfig.viewer },
    office: { ...initialConfig.office },
    text: { ...initialConfig.text },
    json: { ...initialConfig.json },
    markdown: { ...initialConfig.markdown },
  };
}
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
