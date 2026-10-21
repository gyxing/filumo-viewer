import type { DocumentSource, OpenContext } from '@filumo/core';
import { createSession } from '@filumo/core';
import { TextContent } from '@filumo/core/text';
import type { JsonOptions } from '../options';
import { JsonSession } from './JsonSession';
import { resolveJsonVariant } from './jsonVariant';
/** 只完成字节读取和可恢复解码，结构解析由当前阅读模式触发。 */
export async function openJson(
  source: DocumentSource,
  context: OpenContext,
  options: JsonOptions & { workerFactory: () => Worker },
) {
  for (const value of [
    options.maxRecords ?? 1000000,
    options.maxCachedRecords ?? 3,
    options.maxCachedNodes ?? 200000,
  ])
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error('JSON 记录预算必须是正整数');
  if (
    !Number.isInteger(options.initialExpandDepth ?? 2) ||
    (options.initialExpandDepth ?? 2) < 0
  )
    throw new Error('JSON 初始展开层级必须是非负整数');
  if (
    !Number.isInteger(options.maxDepth ?? 256) ||
    (options.maxDepth ?? 256) <= 0 ||
    !Number.isInteger(options.maxNodes ?? 200000) ||
    (options.maxNodes ?? 200000) <= 0
  )
    throw new Error('JSON 结构限额必须是正整数');
  // 响应头在 readAll 后才可用，必须按此顺序采集 charset。
  const bytes = await source.readAll(context.signal);
  const variant = resolveJsonVariant(source, options);
  const content = new TextContent(
    bytes,
    { ...options, mimeType: source.mimeType },
    context.signal,
    async (task, payload, signal) => {
      if (task === 'index-json-lines')
        return (await import('../parser/scanJsonLines')).scanJsonLines(
          (payload as { text: string }).text,
          payload as { maxRecords: number; maxDepth: number; maxNodes: number },
          signal,
        );
      if (task !== 'parse-json') throw new Error('未知 JSON 任务');
      const data = payload as {
        text: string;
        maxDepth: number;
        maxNodes: number;
        variant?: 'json' | 'jsonc';
      };
      return (await import('../parser/scanJson')).scanJson(
        data.text,
        data,
        signal,
      );
    },
  );
  try {
    await content.setEncoding(options.encoding ?? 'auto');
    const data =
      variant === 'lines'
        ? new (await import('./JsonLinesSession')).JsonLinesSession(
            content,
            options,
          )
        : new JsonSession(content, options, variant);
    return createSession({
      sessionId: context.sessionId,
      source,
      signal: context.signal,
      format: 'json',
      data,
      dispose: () => {
        data.dispose();
        content.dispose();
      },
    });
  } catch (error) {
    content.dispose();
    throw error;
  }
}
