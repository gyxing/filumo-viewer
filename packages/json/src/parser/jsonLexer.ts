import { throwIfAborted } from '@filumo/core';
export type JsonTokenKind =
  | 'string'
  | 'number'
  | 'true'
  | 'false'
  | 'null'
  | '{'
  | '}'
  | '['
  | ']'
  | ':'
  | ','
  | 'eof';
export interface JsonToken {
  kind: JsonTokenKind;
  start: number;
  end: number;
}

/** JSON/JSONC 与逐行校验共用词法规则，end 明确阻止读取到下一条记录。 */
export async function readJsonToken(
  text: string,
  initialOffset: number,
  variant: 'json' | 'jsonc',
  signal: AbortSignal,
  end = text.length,
): Promise<JsonToken> {
  let offset = initialOffset,
    next = offset + 65536;
  const check = async () => {
    if (offset >= next) {
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
      throwIfAborted(signal);
      next = offset + 65536;
    }
  };
  const fail = (message: string, position = offset): never => {
    throw { message, offset: position };
  };
  throwIfAborted(signal);
  while (offset < end) {
    if (offset >= next) await check();
    if (/[ \r\n\t]/.test(text[offset])) {
      offset++;
      continue;
    }
    if (
      variant === 'jsonc' &&
      text[offset] === '/' &&
      text[offset + 1] === '/'
    ) {
      offset += 2;
      while (offset < end && !/[\r\n]/.test(text[offset])) {
        offset++;
        if (offset >= next) await check();
      }
      continue;
    }
    if (
      variant === 'jsonc' &&
      text[offset] === '/' &&
      text[offset + 1] === '*'
    ) {
      const start = offset;
      offset += 2;
      while (
        offset + 1 < end &&
        !(text[offset] === '*' && text[offset + 1] === '/')
      ) {
        offset++;
        if (offset >= next) await check();
      }
      if (offset + 1 >= end) fail('块注释没有结束', start);
      offset += 2;
      continue;
    }
    break;
  }
  const start = offset;
  if (offset >= end) return { kind: 'eof', start: end, end };
  const char = text[offset];
  if ('{}[]:,'.includes(char))
    return { kind: char as JsonTokenKind, start, end: start + 1 };
  if (char === '"') {
    offset++;
    while (offset < end) {
      if (offset >= next) await check();
      const current = text[offset++];
      if (current === '"') return { kind: 'string', start, end: offset };
      if (current.charCodeAt(0) < 32)
        fail('字符串中存在未转义的控制字符', offset - 1);
      if (current === '\\') {
        if (offset >= end) fail('字符串未结束');
        const escaped = text[offset++];
        if (escaped === 'u') {
          if (
            offset + 4 > end ||
            !/^[\da-f]{4}$/i.test(text.slice(offset, offset + 4))
          )
            fail('Unicode 转义无效');
          offset += 4;
        } else if (!'"\\/bfnrt'.includes(escaped))
          fail('字符串转义无效', offset - 1);
      }
    }
    return fail('字符串未结束');
  }
  for (const literal of ['true', 'false', 'null'] as const)
    if (start + literal.length <= end && text.startsWith(literal, start))
      return { kind: literal, start, end: start + literal.length };
  if (char === '-' || /\d/.test(char)) {
    const digits = async () => {
      const first = offset;
      while (offset < end && text[offset] >= '0' && text[offset] <= '9') {
        offset++;
        if (offset >= next) await check();
      }
      if (first === offset) fail('数字缺少有效数位');
    };
    if (char === '-') offset++;
    if (text[offset] === '0' && offset < end) offset++;
    else await digits();
    if (text[offset] === '.' && offset < end) {
      offset++;
      await digits();
    }
    if (offset < end && (text[offset] === 'e' || text[offset] === 'E')) {
      offset++;
      if (text[offset] === '+' || text[offset] === '-') offset++;
      await digits();
    }
    return { kind: 'number', start, end: offset };
  }
  return fail('JSON 值无效', start);
}
