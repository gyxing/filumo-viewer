import { csv } from '@fivo/csv';
import { xml } from '@fivo/xml';
import { code } from '@fivo/code';
import { image } from '@fivo/image';
import { json } from '@fivo/json';
import { markdown } from '@fivo/markdown';
import { office } from '@fivo/office';
import { pdf } from '@fivo/pdf';
import { text } from '@fivo/text';
/** 标准预设只创建轻量描述符，实际引擎和视图在打开对应文件时加载。 */
export const standardPlugins: readonly ReturnType<typeof office>[] =
  Object.freeze([
    office(),
    text(),
    json(),
    markdown(),
    image(),
    pdf(),
    csv(),
    xml(),
    code(),
  ]);
export { image } from '@fivo/image';
export { json } from '@fivo/json';
export { markdown } from '@fivo/markdown';
export { office } from '@fivo/office';
export { pdf } from '@fivo/pdf';
export { text } from '@fivo/text';
export { csv } from '@fivo/csv';
export { xml } from '@fivo/xml';
export { code } from '@fivo/code';
