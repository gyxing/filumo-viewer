import type { ViewerPlugin } from '@filumo/dom';
import {
  code,
  csv,
  image,
  json,
  markdown,
  office,
  pdf,
  text,
  xml,
} from '@filumo/viewer';
import type { PlaygroundConfig } from './playground-config';

type PlaygroundPluginConfig = Pick<PlaygroundConfig, 'office' | 'pdf'>;

interface PlaygroundPluginDefinition {
  name: string;
  create(config: PlaygroundPluginConfig): ViewerPlugin;
  options?(config: PlaygroundPluginConfig): object;
}

// 预览与接入代码共用注册清单；这里只创建描述符，格式引擎仍在打开文件时加载。
const PLUGINS: readonly PlaygroundPluginDefinition[] = [
  {
    name: 'office',
    create: (config) => office(config.office),
    options: (config) => config.office,
  },
  { name: 'text', create: () => text() },
  { name: 'json', create: () => json() },
  { name: 'markdown', create: () => markdown() },
  { name: 'image', create: () => image() },
  {
    name: 'pdf',
    create: (config) => pdf(config.pdf),
    options: (config) => config.pdf,
  },
  { name: 'csv', create: () => csv() },
  { name: 'xml', create: () => xml() },
  { name: 'code', create: () => code() },
];

/** 为公开体验创建稳定的插件描述符，不预先加载解析器。 */
export function createPlaygroundPlugins(
  config: PlaygroundPluginConfig,
): ViewerPlugin[] {
  return PLUGINS.map((plugin) => plugin.create(config));
}

/** 从实际注册清单生成公开工厂调用，避免示例遗漏格式或专属配置。 */
export function getPlaygroundPluginSource(config: PlaygroundPluginConfig) {
  return {
    imports:
      'import { ' +
      PLUGINS.map((plugin) => plugin.name).join(', ') +
      " } from '@filumo/viewer';",
    declaration:
      'const plugins = [\n' +
      PLUGINS.map((plugin) => {
        const options = plugin.options?.(config);
        const value =
          options && Object.keys(options).length
            ? JSON.stringify(options, null, 2)
            : '';
        return '  ' + plugin.name + '(' + value + '),';
      }).join('\n') +
      '\n];',
  };
}
