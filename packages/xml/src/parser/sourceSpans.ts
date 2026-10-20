import { throwIfAborted } from '@fivo/core';
import type { XmlSourceAttribute, XmlSourceToken } from './types';

/** 记录原始边界，语法合法性仍由 SAX 决定，避免实体展开改变定位。 */
export async function* sourceSpans(
  text: string,
  signal: AbortSignal,
  maxAttributes = 200000,
): AsyncGenerator<XmlSourceToken> {
  let at = 0,
    next = 65536;
  const check = async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
    throwIfAborted(signal);
    next = at + 65536;
  };
  const fail = (message: string): never => {
    throw { message, offset: at };
  };
  const find = async (needle: string, start: number): Promise<number> => {
    let cursor = start;
    while (cursor < text.length) {
      const end = Math.min(text.length, cursor + 65536 + needle.length - 1),
        found = text.slice(cursor, end).indexOf(needle);
      if (found >= 0) return cursor + found;
      cursor += 65536;
      await new Promise<void>((r) => setTimeout(r, 0));
      throwIfAborted(signal);
    }
    return -1;
  };
  while (at < text.length) {
    if (at >= next) await check();
    const start = at;
    if (text[at] !== '<') {
      const found = await find('<', at);
      at = found < 0 ? text.length : found;
      yield { kind: 'text', start, end: at };
      continue;
    }
    const special = text.startsWith('<!--', at)
      ? { kind: 'comment' as const, prefix: 4, close: '-->' }
      : text.startsWith('<![CDATA[', at)
      ? { kind: 'cdata' as const, prefix: 9, close: ']]>' }
      : text.startsWith('<?', at)
      ? { kind: 'processing' as const, prefix: 2, close: '?>' }
      : undefined;
    if (special) {
      const end = await find(special.close, at + special.prefix);
      if (end < 0) fail('XML 标记没有结束');
      at = end + special.close.length;
      yield {
        kind: special.kind,
        start,
        end: at,
        valueStart: start + special.prefix,
        valueEnd: end,
      };
      continue;
    }
    if (text.startsWith('<!', at))
      fail('首版不处理 DOCTYPE、DTD 或外部实体声明，请查看原文。');
    const close = text[at + 1] === '/';
    at += close ? 2 : 1;
    const nameStart = at;
    while (at < text.length && !/[\s/>]/.test(text[at])) {
      at++;
      if (at >= next) await check();
    }
    const name = text.slice(nameStart, at),
      attributes: XmlSourceAttribute[] = [];
    while (at < text.length) {
      if (at >= next) await check();
      if (/\s/.test(text[at])) {
        at++;
        continue;
      }
      if (text[at] === '>') {
        at++;
        break;
      }
      if (text[at] === '/' && text[at + 1] === '>') {
        at += 2;
        break;
      }
      if (close) fail('XML 结束标签无效');
      const attributeStart = at;
      while (at < text.length && !/[\s=/>]/.test(text[at])) {
        at++;
        if (at >= next) await check();
      }
      const attributeName = text.slice(attributeStart, at);
      while (/\s/.test(text[at] ?? '')) {
        at++;
        if (at >= next) await check();
      }
      if (!attributeName || text[at++] !== '=') fail('XML 属性缺少等号');
      while (/\s/.test(text[at] ?? '')) {
        at++;
        if (at >= next) await check();
      }
      const quote = text[at++];
      if (quote !== '"' && quote !== "'") fail('XML 属性必须使用引号');
      const valueStart = at;
      while (at < text.length && text[at] !== quote) {
        at++;
        if (at >= next) await check();
      }
      if (at >= text.length) fail('XML 属性引号没有结束');
      if (attributes.length >= maxAttributes)
        throw {
          message: 'XML 属性数量超过结构预算，请查看原文。',
          offset: attributeStart,
          limited: true,
        };
      attributes.push({
        name: attributeName,
        start: attributeStart,
        end: at + 1,
        valueStart,
        valueEnd: at,
      });
      at++;
    }
    if (!name || text[at - 1] !== '>') fail('XML 标签没有结束');
    yield { kind: close ? 'close' : 'open', start, end: at, name, attributes };
  }
  throwIfAborted(signal);
}
