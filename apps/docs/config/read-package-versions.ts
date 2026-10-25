import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WORKSPACE_PACKAGES } from '../../../scripts/workspace-packages.js';

/** 只在构建配置中读取版本；前端接收字符串注入，不导入包或猜测 npm 发布状态。 */
export function readPackageVersions(root: string): Record<string, string> {
  return Object.fromEntries(
    WORKSPACE_PACKAGES.map(({ name }) => {
      const manifest = JSON.parse(
        readFileSync(resolve(root, 'packages', name, 'package.json'), 'utf8'),
      );
      return [manifest.name, manifest.version];
    }),
  );
}
