import { throwIfAborted } from '@fivo/core';
import type {
  JsonDiagnostic,
  JsonNode,
  JsonNodeType,
  JsonParseResult,
} from './types';
interface Frame {
  node: JsonNode;
  state:
    | 'key-or-end'
    | 'key'
    | 'colon'
    | 'value'
    | 'array-or-end'
    | 'array-value'
    | 'comma';
  property?: JsonNode;
  keys: Set<string>;
}
/** 只扫描标准 JSON，结构与数值均以源范围保留，避免转换为对象后丢失信息。 */
export async function scanJson(
  text: string,
  options: { maxDepth: number; maxNodes: number },
  signal: AbortSignal,
): Promise<JsonParseResult> {
  const nodes: JsonNode[] = [],
    diagnostics: JsonDiagnostic[] = [],
    stack: Frame[] = [];
  let offset = 0,
    rootId = '',
    steps = 0;
  // 诊断位置按单调扫描进度增量计算，重复属性多时也不反复切分整个前缀。
  let measured = 0,
    line = 1,
    lineStart = 0;
  const diagnostic = (
    message: string,
    position = offset,
    severity: JsonDiagnostic['severity'] = 'error',
  ) => {
    while (measured < position) {
      const char = text[measured++];
      if (char === '\r') {
        if (text[measured] === '\n' && measured < position) measured++;
        line++;
        lineStart = measured;
      } else if (char === '\n') {
        line++;
        lineStart = measured;
      }
    }
    return {
      message,
      offset: position,
      line,
      column: position - lineStart + 1,
      severity,
    };
  };
  const fail = (message: string): never => {
    throw diagnostic(message);
  };
  const whitespace = () => {
    while (offset < text.length && /[ \r\n\t]/.test(text[offset])) offset++;
  };
  const add = (type: JsonNodeType, start: number, parent?: JsonNode) => {
    if (nodes.length >= options.maxNodes) fail('JSON 节点数量超过限制');
    const node: JsonNode = {
      id: String(nodes.length),
      type,
      start,
      end: start,
      parentId: parent?.id,
      childIds: [],
    };
    nodes.push(node);
    parent?.childIds.push(node.id);
    return node;
  };
  const string = async () => {
    const start = offset++;
    let checkpoint = offset + 65536;
    while (offset < text.length) {
      if (offset >= checkpoint) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
        throwIfAborted(signal);
        checkpoint = offset + 65536;
      }
      const char = text[offset++];
      if (char === '"') return { start, end: offset };
      if (char.charCodeAt(0) < 32) fail('字符串中存在未转义的控制字符');
      if (char === '\\') {
        const escaped = text[offset++];
        if (escaped === 'u') {
          if (!/^[0-9a-f]{4}$/i.test(text.slice(offset, offset + 4)))
            fail('Unicode 转义无效');
          offset += 4;
        } else if (!escaped || !'"\\/bfnrt'.includes(escaped))
          fail('字符串转义无效');
      }
    }
    return fail('字符串未结束');
  };
  const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const value = async (parent?: JsonNode): Promise<JsonNode> => {
    whitespace();
    const start = offset,
      char = text[offset];
    if (char === '{' || char === '[') {
      if (stack.length >= options.maxDepth) fail('JSON 嵌套深度超过限制');
      const node = add(char === '{' ? 'object' : 'array', start, parent);
      offset++;
      stack.push({
        node,
        state: char === '{' ? 'key-or-end' : 'array-or-end',
        keys: new Set(),
      });
      return node;
    }
    if (char === '"') {
      const range = await string();
      const node = add('string', start, parent);
      node.end = range.end;
      return node;
    }
    for (const literal of ['true', 'false', 'null'])
      if (text.startsWith(literal, offset)) {
        const node = add(
          literal === 'null' ? 'null' : 'boolean',
          start,
          parent,
        );
        offset += literal.length;
        node.end = offset;
        return node;
      }
    number.lastIndex = offset;
    const matched = number.exec(text);
    if (matched) {
      const node = add('number', start, parent);
      offset = number.lastIndex;
      node.end = offset;
      return node;
    }
    return fail('应为 JSON 值');
  };
  try {
    throwIfAborted(signal);
    whitespace();
    rootId = (await value()).id;
    while (stack.length) {
      if (++steps % 4096 === 0) {
        throwIfAborted(signal);
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
      }
      whitespace();
      const frame = stack[stack.length - 1],
        char = text[offset];
      if (frame.state === 'key-or-end' || frame.state === 'key') {
        if (char === '}' && frame.state === 'key-or-end') {
          frame.node.end = ++offset;
          stack.pop();
          continue;
        }
        if (char !== '"') fail('对象属性名必须使用双引号');
        const range = await string(),
          key = JSON.parse(text.slice(range.start, range.end)) as string;
        if (frame.keys.has(key))
          diagnostics.push(
            diagnostic('重复属性：' + key, range.start, 'warning'),
          );
        frame.keys.add(key);
        const property = add('property', range.start, frame.node);
        property.key = key;
        property.keyRange = range;
        frame.property = property;
        frame.state = 'colon';
      } else if (frame.state === 'colon') {
        if (char !== ':') fail('属性名后缺少冒号');
        offset++;
        frame.state = 'value';
      } else if (frame.state === 'value') {
        frame.state = 'comma';
        await value(frame.property);
      } else if (
        frame.state === 'array-or-end' ||
        frame.state === 'array-value'
      ) {
        if (char === ']' && frame.state === 'array-or-end') {
          frame.node.end = ++offset;
          stack.pop();
          continue;
        }
        frame.state = 'comma';
        await value(frame.node);
      } else {
        if (frame.property) {
          frame.property.end = nodes[Number(frame.property.childIds[0])].end;
          frame.property = undefined;
        }
        const close = frame.node.type === 'object' ? '}' : ']';
        if (char === close) {
          frame.node.end = ++offset;
          stack.pop();
        } else if (char === ',') {
          offset++;
          frame.state = frame.node.type === 'object' ? 'key' : 'array-value';
        } else fail('缺少逗号或结束括号');
      }
    }
    whitespace();
    if (offset !== text.length) fail('JSON 值后存在额外内容');
    throwIfAborted(signal);
    return { kind: 'ready', document: { text, nodes, rootId, diagnostics } };
  } catch (error) {
    throwIfAborted(signal);
    const current = error as Partial<JsonDiagnostic>;
    diagnostics.push(
      typeof current?.offset === 'number'
        ? (current as JsonDiagnostic)
        : diagnostic('JSON 语法无效'),
    );
    return { kind: 'invalid', text, diagnostics };
  }
}
