import { office } from '@fivo/office';
/** 当前标准预设只包含 Office；新增格式不会自动进入宿主依赖。 */
export const standardPlugins: readonly ReturnType<typeof office>[] =
  Object.freeze([office()]);
export { office } from '@fivo/office';
