import { throwIfAborted } from '@filumo/core';
import { readJsonToken } from './jsonLexer';
import type { JsonToken } from './jsonLexer';

/** 校验记录只持有语法栈，不为每一行构建长期结构树。 */
export async function validateJsonRecord(
  text: string,
  start: number,
  end: number,
  limits: { maxDepth: number; maxNodes: number },
  signal: AbortSignal,
): Promise<boolean> {
  const stack: {
    object: boolean;
    state: 'key-or-end' | 'key' | 'colon' | 'value-or-end' | 'value' | 'comma';
  }[] = [];
  let offset = start,
    nodes = 0,
    steps = 0;
  const value = (token: JsonToken) => {
    if (++nodes > limits.maxNodes) throw new Error('记录节点数量超过限制');
    offset = token.end;
    if (token.kind === '{' || token.kind === '[') {
      if (stack.length >= limits.maxDepth) throw new Error('记录深度超过限制');
      stack.push({
        object: token.kind === '{',
        state: token.kind === '{' ? 'key-or-end' : 'value-or-end',
      });
    } else if (
      !['string', 'number', 'true', 'false', 'null'].includes(token.kind)
    )
      throw new Error('JSON 值无效');
  };
  try {
    value(await readJsonToken(text, offset, 'json', signal, end));
    while (stack.length) {
      if (++steps % 4096 === 0) {
        await new Promise<void>((r) => { setTimeout(r, 0); });
        throwIfAborted(signal);
      }
      const frame = stack[stack.length - 1],
        token = await readJsonToken(text, offset, 'json', signal, end);
      offset = token.end;
      if (frame.state === 'key-or-end' || frame.state === 'key') {
        if (token.kind === '}' && frame.state === 'key-or-end') {
          stack.pop();
          continue;
        }
        if (token.kind !== 'string' || ++nodes > limits.maxNodes) return false;
        frame.state = 'colon';
      } else if (frame.state === 'colon') {
        if (token.kind !== ':') return false;
        frame.state = 'value';
      } else if (frame.state === 'value' || frame.state === 'value-or-end') {
        if (
          !frame.object &&
          token.kind === ']' &&
          frame.state === 'value-or-end'
        ) {
          stack.pop();
          continue;
        }
        frame.state = 'comma';
        value(token);
      } else if (token.kind === (frame.object ? '}' : ']')) stack.pop();
      else if (token.kind === ',') frame.state = frame.object ? 'key' : 'value';
      else return false;
    }
    return (
      (await readJsonToken(text, offset, 'json', signal, end)).kind === 'eof'
    );
  } catch {
    throwIfAborted(signal);
    return false;
  }
}
