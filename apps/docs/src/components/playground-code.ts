import type { PlaygroundConfig } from './playground-config';
import { getPlaygroundPluginSource } from './playground-plugins';
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
) {
  const pluginSource = getPlaygroundPluginSource(config);
  const options = JSON.stringify(config.viewer, null, 2);
  if (tab === 'config') return JSON.stringify(config, null, 2);
  if (tab === 'react')
    return [
      "import { DocumentViewer } from '@filumo/react';",
      "import type { ViewerConfiguration } from '@filumo/react';",
      pluginSource.imports,
      '',
      pluginSource.declaration,
      'const options: ViewerConfiguration = ' + options + ';',
      '',
      'export function Preview({ file }: { file?: File }) {',
      '  return <DocumentViewer source={file} plugins={plugins} options={options} />;',
      '}',
    ].join('\n');
  if (tab === 'vue3')
    return [
      '<script setup lang="ts">',
      "import { DocumentViewer } from '@filumo/vue';",
      "import type { ViewerConfiguration } from '@filumo/vue';",
      pluginSource.imports,
      '',
      'defineProps<{ file?: File }>();',
      pluginSource.declaration,
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
      "import { DocumentViewer } from '@filumo/vue2';",
      pluginSource.imports,
      '',
      pluginSource.declaration
        .replace('const plugins = [', 'const plugins = Object.freeze([')
        .replace(/];$/, ']);'),
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
    "import { createViewer } from '@filumo/dom';",
    pluginSource.imports,
    '',
    pluginSource.declaration,
    'const options = ' + options + ';',
    '',
    'export function mountPreview(container, file) {',
    '  const viewer = createViewer(container, { ...options, plugins });',
    '  if (file) void viewer.open(file).catch(console.error);',
    '  // 宿主卸载时调用 dispose，释放文档和样式租约。',
    '  return { viewer, dispose: () => viewer.destroy() };',
    '}',
  ].join('\n');
}
