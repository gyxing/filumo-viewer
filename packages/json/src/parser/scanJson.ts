import { throwIfAborted } from '@filumo/core';
import { readJsonToken } from './jsonLexer';
import type { JsonToken } from './jsonLexer';
import type {
  JsonDiagnostic,
  JsonNode,
  JsonNodeType,
  JsonParseResult,
} from './types';
interface Frame {
  node: JsonNode;
  state: 'key-or-end' | 'key' | 'colon' | 'value-or-end' | 'value' | 'comma';
  property?: JsonNode;
  keys: Set<string>;
}

/** 严格 JSON 与 JSONC 共用原文词法范围，重复属性和大数值不经过对象转换。 */
export async function scanJson(
  text: string,
  options: { maxDepth: number; maxNodes: number; variant?: 'json' | 'jsonc' },
  signal: AbortSignal,
): Promise<JsonParseResult> {
  const nodes: JsonNode[] = [],
    diagnostics: JsonDiagnostic[] = [],
    stack: Frame[] = [];
  let offset = 0,
    measured = 0,
    line = 1,
    lineStart = 0,
    rootId = '',
    steps = 0;
  const variant = options.variant ?? 'json';
  const diagnostic = (
    message: string,
    position: number,
    severity: 'error' | 'warning' = 'error',
  ): JsonDiagnostic => {
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
  const fail = (message: string, position = offset): never => {
    throw { message, offset: position };
  };
  const add = (
    type: JsonNodeType,
    start: number,
    parent?: JsonNode,
  ): JsonNode => {
    if (nodes.length >= options.maxNodes) fail('JSON 节点数量超过限制', start);
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
  const value = (token: JsonToken, parent?: JsonNode): JsonNode => {
    offset = token.end;
    if (token.kind === '{' || token.kind === '[') {
      if (stack.length >= options.maxDepth)
        fail('JSON 嵌套深度超过限制', token.start);
      const node = add(
        token.kind === '{' ? 'object' : 'array',
        token.start,
        parent,
      );
      stack.push({
        node,
        state: token.kind === '{' ? 'key-or-end' : 'value-or-end',
        keys: new Set(),
      });
      return node;
    }
    const type =
      token.kind === 'string'
        ? 'string'
        : token.kind === 'number'
        ? 'number'
        : token.kind === 'null'
        ? 'null'
        : token.kind === 'true' || token.kind === 'false'
        ? 'boolean'
        : undefined;
    if (!type) return fail('JSON 值无效', token.start);
    const node = add(type, token.start, parent);
    node.end = token.end;
    return node;
  };
  try {
    throwIfAborted(signal);
    rootId = value(await readJsonToken(text, offset, variant, signal)).id;
    while (stack.length) {
      if (++steps % 4096 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        throwIfAborted(signal);
      }
      const frame = stack[stack.length - 1],
        token = await readJsonToken(text, offset, variant, signal),
        close = frame.node.type === 'object' ? '}' : ']';
      offset = token.start;
      if (frame.state === 'key-or-end' || frame.state === 'key') {
        if (
          token.kind === '}' &&
          (frame.state === 'key-or-end' || variant === 'jsonc')
        ) {
          frame.node.end = offset = token.end;
          stack.pop();
          continue;
        }
        if (token.kind !== 'string') fail('对象属性名必须使用双引号');
        const key = JSON.parse(text.slice(token.start, token.end)) as string;
        if (frame.keys.has(key))
          diagnostics.push(
            diagnostic('重复属性：' + key, token.start, 'warning'),
          );
        frame.keys.add(key);
        const property = add('property', token.start, frame.node);
        property.key = key;
        property.keyRange = { start: token.start, end: token.end };
        frame.property = property;
        frame.state = 'colon';
        offset = token.end;
      } else if (frame.state === 'colon') {
        if (token.kind !== ':') fail('属性名后缺少冒号');
        frame.state = 'value';
        offset = token.end;
      } else if (frame.state === 'value-or-end' || frame.state === 'value') {
        if (
          frame.node.type === 'array' &&
          token.kind === ']' &&
          (frame.state === 'value-or-end' || variant === 'jsonc')
        ) {
          frame.node.end = offset = token.end;
          stack.pop();
          continue;
        }
        frame.state = 'comma';
        value(token, frame.property ?? frame.node);
      } else {
        if (frame.property) {
          frame.property.end = nodes[Number(frame.property.childIds[0])].end;
          frame.property = undefined;
        }
        if (token.kind === close) {
          frame.node.end = offset = token.end;
          stack.pop();
        } else if (token.kind === ',') {
          frame.state = frame.node.type === 'object' ? 'key' : 'value';
          offset = token.end;
        } else fail('缺少逗号或结束括号');
      }
    }
    const last = await readJsonToken(text, offset, variant, signal);
    if (last.kind !== 'eof') fail('JSON 值后存在额外内容', last.start);
    throwIfAborted(signal);
    return { kind: 'ready', document: { text, nodes, rootId, diagnostics } };
  } catch (error) {
    throwIfAborted(signal);
    const current = error as { message?: string; offset?: number };
    diagnostics.push(
      diagnostic(current.message ?? 'JSON 解析失败', current.offset ?? offset),
    );
    return { kind: 'invalid', text, diagnostics };
  }
}
