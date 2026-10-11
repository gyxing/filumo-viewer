import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeStyles } from '../../scripts/build/style-order.mjs';
test('外部 CSS 按稳定路径顺序生成，不依赖异步编译完成顺序',()=>{
 const first=new Map([['styles/z.less','z{}'],['styles/a.less','a{}']]);
 const second=new Map([...first].reverse());
 assert.equal(serializeStyles(first),serializeStyles(second));
 assert.equal(serializeStyles(first),'a{}\nz{}');
});
