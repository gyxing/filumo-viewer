import type { WebsiteLocale } from './home-content';

// 页面语言与预览器语言独立：调整预览器 locale 不应切换整站文案。
const content = {
  'zh-CN': {
    eyebrow: '交互式体验',
    title: '调整预览参数，直接使用生成的代码。',
    description:
      '使用 Filumo 0.1.0 预览 Office、PDF、图片、文本、JSON、Markdown、CSV、XML 和代码文件。调整展示参数，预览与接入代码同步更新。',
    privacy: '文件只在当前浏览器内解析，不会上传到服务器。',
    controls: '参数配置',
    reset: '恢复默认',
    appearance: '外观与布局',
    viewing: '预览行为',
    resources: 'Office 专属设置',
    theme: '主题',
    light: '浅色',
    dark: '深色',
    height: '预览高度',
    zoom: '缩放比例',
    language: '预览器语言',
    toolbar: '工具栏',
    toolbarDefault: '默认工具栏',
    toolbarHidden: '隐藏工具栏',
    watermark: '显示水印',
    watermarkText: '水印文字',
    worker: 'Office Worker 策略',
    workerAuto: '自动选择',
    workerAlways: '必须使用 Worker',
    workerNever: '仅主线程',
    media: '允许文档内嵌音视频',
    resourceHint:
      '这些选项仅影响 Office；外部媒体默认禁止。PDF 使用包内的同版资源，其他格式沿用各自默认策略。修改插件参数会重新打开当前文档。',
    preview: '实时预览',
    previewHint:
      '选择本地文件，或使用预览器中的打开文件按钮。未知格式只有通过文本可读性检查后才使用原文预览。',
    file: '选择文件',
    noFile: '尚未选择文件',
    code: '示例代码',
    codeHint:
      '框架标签只切换示例代码。发布后安装对应适配器与 @filumo/viewer；PDF 默认资源由包内部接入，只有自定义部署才需要覆盖地址。0.1.0 当前尚未发布。',
    copy: '复制代码',
    copied: '已复制',
    copyFailed: '复制失败，请手动选择',
    config: '配置',
    help: '查看完整接入指南',
    loading: '正在准备预览',
    ready: '预览就绪',
    error: '预览失败，请检查文件或资源配置。',
  },
  'en-US': {
    eyebrow: 'Interactive playground',
    title: 'Tune the preview. Take the code.',
    description:
      'Preview Office, PDF, images, text, JSON, Markdown, CSV, XML and code with Filumo 0.1.0. Display options stay in sync with the integration examples.',
    privacy: 'Files stay in this browser tab and are never uploaded.',
    controls: 'Parameters',
    reset: 'Reset defaults',
    appearance: 'Appearance & layout',
    viewing: 'Viewing',
    resources: 'Office-specific settings',
    theme: 'Theme',
    light: 'Light',
    dark: 'Dark',
    height: 'Preview height',
    zoom: 'Zoom percentage',
    language: 'Viewer language',
    toolbar: 'Toolbar',
    toolbarDefault: 'Default toolbar',
    toolbarHidden: 'Hidden toolbar',
    watermark: 'Show watermark',
    watermarkText: 'Watermark text',
    worker: 'Office Worker strategy',
    workerAuto: 'Automatic',
    workerAlways: 'Require Worker',
    workerNever: 'Main thread only',
    media: 'Enable embedded audio and video',
    resourceHint:
      'These settings affect Office only; external media stays blocked. PDF uses matching assets from the package, and other formats keep their own defaults. Changing plugin options reopens the current file.',
    preview: 'Live preview',
    previewHint:
      "Select a local file or use the viewer's Open file button. Unknown formats use the text fallback only after readability checks.",
    file: 'Select a file',
    noFile: 'No file selected',
    code: 'Example code',
    codeHint:
      'Tabs change example code only. After release, install the chosen adapter and @filumo/viewer, with bundled PDF resources; override asset URLs only for custom deployment. Version 0.1.0 is not yet published.',
    copy: 'Copy code',
    copied: 'Copied',
    copyFailed: 'Copy failed; select the code manually',
    config: 'Configuration',
    help: 'Read the integration guide',
    loading: 'Preparing preview',
    ready: 'Preview ready',
    error: 'Preview failed. Check the file or resource settings.',
  },
};
export type PlaygroundContent = (typeof content)['en-US'];
/** 返回完整本地化页面文案，避免英文页面混入中文控件。 */
export function getPlaygroundContent(locale: WebsiteLocale): PlaygroundContent {
  return content[locale];
}
