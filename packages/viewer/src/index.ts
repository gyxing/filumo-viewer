import { csv } from '@filumo/csv';
import { xml } from '@filumo/xml';
import { code } from '@filumo/code';
import { image } from '@filumo/image';
import { json } from '@filumo/json';
import { markdown } from '@filumo/markdown';
import { office } from '@filumo/office';
import { pdf } from '@filumo/pdf';
import { text } from '@filumo/text';
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
export { image } from '@filumo/image';
export { json } from '@filumo/json';
export { markdown } from '@filumo/markdown';
export { office } from '@filumo/office';
export { pdf } from '@filumo/pdf';
export { text } from '@filumo/text';
export { csv } from '@filumo/csv';
export { xml } from '@filumo/xml';
export { code } from '@filumo/code';
