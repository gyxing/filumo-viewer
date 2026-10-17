import type { TextDecoration } from '@fivo/text/view';

// 着色是可选增强，超长行保留完整普通文本，避免同步词法工作阻塞阅读。
const LINE_BUDGET = 65536;
const KEY_LOOKAHEAD = 4096;
const token =
  /"(?:\\(?:["\\/bfnrt]|u[\da-fA-F]{4})|[^"\\\u0000-\u001f])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|(?:true|false|null)(?![\w$])|[{}[\],:]/y;

/** 对可见逻辑行返回源范围装饰，不转换数值或构造 JSON 对象。 */
export function jsonLineDecorations(
  text: string,
  start: number,
  end: number,
): TextDecoration[] {
  if (end - start > LINE_BUDGET) return [];
  const result: TextDecoration[] = [];
  for (let position = start; position < end; ) {
    token.lastIndex = position;
    const match = token.exec(text);
    if (!match || token.lastIndex > end) {
      if (text[position] === '"') break;
      position++;
      continue;
    }
    const value = match[0],
      finish = token.lastIndex;
    let kind = 'punctuation';
    if (value[0] === '"') {
      let next = finish;
      const limit = Math.min(text.length, finish + KEY_LOOKAHEAD);
      while (next < limit && /[ \t\r\n]/.test(text[next])) next++;
      kind = next < limit && text[next] === ':' ? 'key' : 'string';
    } else if (/^-?\d/.test(value)) kind = 'number';
    else if (value === 'null') kind = 'null';
    else if (value === 'true' || value === 'false') kind = 'boolean';
    result.push({
      start: position,
      end: finish,
      className: 'fivo-json-token-' + kind,
    });
    position = finish;
  }
  return result;
}
