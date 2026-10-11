import type { IApi } from 'dumi';
import { resolve } from 'node:path';
import { createSampleMiddleware } from './sample-middleware';
/** 私有接口只由开发烟测配置注册，生产配置不导入插件。 */
export default (api: IApi) => {
  api.addBeforeMiddlewares(() => [
    createSampleMiddleware(resolve(api.cwd, '../..'), api.config.base),
  ]);
};
