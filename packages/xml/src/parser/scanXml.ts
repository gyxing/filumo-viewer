import { throwIfAborted } from '@fivo/core';
import { SaxesParser } from 'saxes';
import { sourceSpans } from './sourceSpans';
import type { XmlNode, XmlParseResult, XmlSourceToken } from './types';

/** 有界预览解码内建实体，结构位置仍使用完整原文范围。 */
function textPreview(raw: string): string {
  const names: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
  };
  return raw
    .slice(0, 4096)
    .replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/g, (entity) => {
      const key = entity.slice(1, -1);
      return key[0] === '#'
        ? String.fromCodePoint(
            key[1] === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1)),
          )
        : names[key];
    });
}

/** SAX 校验命名空间与实体，原文扫描器提供不受规范化影响的位置。 */
export async function scanXml(
  text: string,
  options: { maxDepth: number; maxNodes: number },
  signal: AbortSignal,
): Promise<XmlParseResult> {
  const nodes: XmlNode[] = [
      {
        id: '0',
        kind: 'document',
        childIds: [],
        start: 0,
        end: text.length,
        name: '#document',
      },
    ],
    stack: XmlNode[] = [nodes[0]];
  const parser = new SaxesParser({ xmlns: true });
  let token: XmlSourceToken = { kind: 'text', start: 0, end: 0 };
  const add = (
    node: Omit<XmlNode, 'id' | 'childIds' | 'parentId'>,
    parent = stack[stack.length - 1],
  ) => {
    if (nodes.length >= options.maxNodes)
      throw {
        message: 'XML 节点数量超过限制，请查看原文。',
        offset: node.start,
        limited: true,
      };
    const value: XmlNode = {
      ...node,
      id: String(nodes.length),
      parentId: parent.id,
      childIds: [],
    };
    nodes.push(value);
    parent.childIds.push(value.id);
    return value;
  };
  parser.on('error', (error) => {
    throw error;
  });
  parser.on('opentag', (tag) => {
    if (stack.length > options.maxDepth)
      throw {
        message: 'XML 元素嵌套深度超过限制，请查看原文。',
        offset: token.start,
        limited: true,
      };
    const node = add({
      kind: 'element',
      name: tag.name,
      namespaceUri: tag.uri,
      start: token.start,
      end: token.end,
    });
    stack.push(node);
    for (const attribute of token.attributes ?? []) {
      const parsed = tag.attributes[attribute.name],
        value =
          parsed?.value ?? text.slice(attribute.valueStart, attribute.valueEnd);
      add(
        {
          kind:
            attribute.name === 'xmlns' || attribute.name.startsWith('xmlns:')
              ? 'namespace'
              : 'attribute',
          name: attribute.name,
          namespaceUri: parsed?.uri,
          start: attribute.start,
          end: attribute.end,
          value: value.slice(0, 160),
          truncated: value.length > 160,
        },
        node,
      );
    }
  });
  parser.on('closetag', () => {
    const node = stack.pop();
    if (node && node.kind !== 'document') node.end = token.end;
  });
  try {
    for await (const current of sourceSpans(text, signal, options.maxNodes)) {
      token = current;
      for (let start = token.start; start < token.end; start += 65536) {
        throwIfAborted(signal);
        parser.write(text.slice(start, Math.min(token.end, start + 65536)));
        if (start + 65536 < token.end)
          await new Promise<void>((r) => setTimeout(r, 0));
      }
      if (token.kind !== 'open' && token.kind !== 'close') {
        const raw = text.slice(
          token.valueStart ?? token.start,
          token.valueEnd ?? token.end,
        );
        const value = token.kind === 'text' ? textPreview(raw) : raw;
        add({
          kind: token.kind,
          start: token.start,
          end: token.end,
          value: value.slice(0, 160),
          whitespace: token.kind === 'text' && !raw.trim(),
          truncated: value.length > 160 || raw.length > 4096,
        });
      }
    }
    parser.close();
    throwIfAborted(signal);
    return { kind: 'ready', document: { nodes, rootId: '0' } };
  } catch (error) {
    throwIfAborted(signal);
    const current = error as {
        message?: string;
        offset?: number;
        limited?: boolean;
      },
      offset =
        current.offset ??
        Math.max(token.start, Math.min(text.length, parser.position - 1));
    let line = 1,
      lineStart = 0;
    for (let i = 0; i < offset; i++) {
      if (text[i] === '\r') {
        if (text[i + 1] === '\n' && i + 1 < offset) i++;
        line++;
        lineStart = i + 1;
      } else if (text[i] === '\n') {
        line++;
        lineStart = i + 1;
      }
    }
    return {
      kind: current.limited ? 'limited' : 'invalid',
      diagnostics: [
        {
          message: current.message ?? 'XML 解析失败',
          offset,
          line,
          column: offset - lineStart + 1,
        },
      ],
    };
  }
}
