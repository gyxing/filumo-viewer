import type { IApi } from 'dumi';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { documentationSitemap } from '../src/components/documentation-seo';
import { normalizeDocsBase } from './base-path.js';

/** 使用公开白名单生成含部署前缀的 sitemap；默认 sitemap 不补充项目 Pages 的 base。 */
export default (api: IApi) => {
  if (api.env !== 'production') return;
  api.onBuildComplete(async ({ err }) => {
    // 失败构建没有输出目录，继续写站点地图会掩盖原始编译错误。
    if (err) return;
    const base = normalizeDocsBase(api.config.base);
    const origin = process.env.FILUMO_DOCS_ORIGIN || 'https://gyxing.github.io';
    await writeFile(
      join(api.paths.absOutputPath, 'sitemap.xml'),
      documentationSitemap(base, origin),
      'utf8',
    );
  });
};
