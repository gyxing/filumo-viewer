import type { ViewerPlugin } from '@fivo/dom';
import type { OfficeOptions } from './options';
/** 实现与声明入口共用唯一工厂合同，公开类型不沿实现动态导入展开。 */
export type OfficeFactory = (options?: OfficeOptions) => ViewerPlugin;
