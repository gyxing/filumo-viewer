import { archive } from '@filumo/archive';
import { code } from '@filumo/code';
import { csv } from '@filumo/csv';
import { image } from '@filumo/image';
import { json } from '@filumo/json';
import { markdown } from '@filumo/markdown';
import { office } from '@filumo/office';
import { pdf } from '@filumo/pdf';
import { text } from '@filumo/text';
import { xml } from '@filumo/xml';
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
    archive(),
  ]);
export { archive } from '@filumo/archive';
export { code } from '@filumo/code';
export { csv } from '@filumo/csv';
export { image } from '@filumo/image';
export { json } from '@filumo/json';
export { markdown } from '@filumo/markdown';
export { office } from '@filumo/office';
export { pdf } from '@filumo/pdf';
export { text } from '@filumo/text';
export { xml } from '@filumo/xml';
