import { json } from '@fivo/json';
import { markdown } from '@fivo/markdown';
import { office } from '@fivo/office';
import { text } from '@fivo/text';
/** 标准预设只创建轻量描述符，实际引擎和视图在打开对应文件时加载。 */
export const standardPlugins: readonly ReturnType<typeof office>[] =
  Object.freeze([office(), text(), json(), markdown()]);
export { json } from '@fivo/json';
export { markdown } from '@fivo/markdown';
export { office } from '@fivo/office';
export { text } from '@fivo/text';
