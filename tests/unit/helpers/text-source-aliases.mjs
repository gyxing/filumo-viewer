import { resolve } from 'node:path';
/** 单元用例引用当前公共源码，避免兼容转导出误读旧 dist。 */
export const textSourceAliases = {
  '@filumo/core/text': resolve('packages/core/src/text.ts'),
  '@filumo/dom/text': resolve('packages/dom/src/text.ts'),
  '@filumo/dom/text-messages': resolve('packages/dom/src/text-messages.ts'),
  '@filumo/dom/text-highlight': resolve('packages/dom/src/text-highlight.ts'),
  '@filumo/dom/split': resolve('packages/dom/src/split.ts'),
};
