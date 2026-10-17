import type { DocumentSource, OpenContext } from '@fivo/core';
import { createSession } from '@fivo/core';
import { TextContent } from '@fivo/text/reader';
import type { JsonOptions } from '../options';
import { JsonSession } from './JsonSession';
/** 只完成字节读取和可恢复解码，结构解析由当前阅读模式触发。 */
export async function openJson(
  source: DocumentSource,
  context: OpenContext,
  options: JsonOptions & { workerFactory: () => Worker },
) {
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
  const content = new TextContent(
    await source.readAll(context.signal),
    { ...options, mimeType: source.mimeType },
    context.signal,
    async (task, payload, signal) => {
      if (task !== 'parse-json') throw new Error('未知 JSON 任务');
      const data = payload as {
        text: string;
        maxDepth: number;
        maxNodes: number;
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
    return createSession({
      sessionId: context.sessionId,
      source,
      signal: context.signal,
      format: 'json',
      data: new JsonSession(content, options),
      dispose: content.dispose,
    });
  } catch (error) {
    content.dispose();
    throw error;
  }
}
