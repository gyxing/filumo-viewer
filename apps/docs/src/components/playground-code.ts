import type { WebsiteLocale } from './home-content';
import type { PlaygroundConfig } from './playground-config';
export type PlaygroundCodeTab =
  | 'react'
  | 'vue3'
  | 'vue2'
  | 'javascript'
  | 'config';

/** 从同一配置生成各框架可复制的代码，只使用当前稳定公开入口。 */
export function generateExample(
  config: PlaygroundConfig,
  tab: PlaygroundCodeTab = 'react',
  locale: WebsiteLocale = 'zh-CN',
) {
  const office = JSON.stringify(config.office, null, 2);
  const options = JSON.stringify(config.viewer, null, 2);
  if (tab === 'config') return JSON.stringify(config, null, 2);
  if (tab === 'react')
    return [
      "import { DocumentViewer } from '@fivo/react';",
      "import type { ViewerConfiguration } from '@fivo/dom';",
      "import { office } from '@fivo/office';",
      '',
      'const plugins = [office(' + office + ')];',
      'const options: ViewerConfiguration = ' + options + ';',
      '',
      'export function Preview({ file }: { file?: File }) {',
      '  return <DocumentViewer source={file} plugins={plugins} options={options} />;',
      '}',
    ].join('\n');
  if (tab === 'vue3')
    return [
      '<script setup lang="ts">',
      "import { DocumentViewer } from '@fivo/vue';",
      "import type { ViewerConfiguration } from '@fivo/dom';",
      "import { office } from '@fivo/office';",
      '',
      'defineProps<{ file?: File }>();',
      'const plugins = [office(' + office + ')];',
      'const options: ViewerConfiguration = ' + options + ';',
      '</script>',
      '',
      '<template>',
      '  <DocumentViewer :source="file" :plugins="plugins" :options="options" />',
      '</template>',
    ].join('\n');
  if (tab === 'vue2')
    return [
      '<script>',
      "import { DocumentViewer } from '@fivo/vue2';",
      "import { office } from '@fivo/office';",
      '',
      'const plugins = Object.freeze([office(' + office + ')]);',
      'export default {',
      '  components: { DocumentViewer },',
      '  props: { file: { default: undefined } },',
      '  data() { return { plugins, options: ' + options + ' }; },',
      '};',
      '</script>',
      '',
      '<template>',
      '  <DocumentViewer :source="file" :plugins="plugins" :options="options" />',
      '</template>',
    ].join('\n');
  return [
    "import { createViewer } from '@fivo/dom';",
    "import { office } from '@fivo/office';",
    '',
    'const plugins = [office(' + office + ')];',
    'const options = ' + options + ';',
    '',
    'export function mountPreview(container, file) {',
    '  const viewer = createViewer(container, { ...options, plugins });',
    '  if (file) void viewer.open(file).catch(console.error);',
    '  // ' +
      (locale === 'zh-CN'
        ? '宿主卸载时调用 dispose，释放文档和样式租约。'
        : 'Call dispose when the host unmounts to release document and style leases.'),
    '  return { viewer, dispose: () => viewer.destroy() };',
    '}',
  ].join('\n');
}
