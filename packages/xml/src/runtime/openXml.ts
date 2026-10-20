import { createSession } from '@fivo/core';
import type { DocumentSource, OpenContext } from '@fivo/core';
import { TextContent } from '@fivo/core/text';
import type { TaskWorker } from '@fivo/core/text';
import type { XmlOptions } from '../options';
import { xmlEncodingHint } from './xmlEncodingHint';
import { XmlSession } from './XmlSession';

/** 解码与结构分离，XML 声明只作为公共解码的低优先级提示。 */
export async function openXml(
  source: DocumentSource,
  context: OpenContext,
  options: XmlOptions & { workerFactory: () => TaskWorker },
) {
  for (const value of [options.maxDepth ?? 256, options.maxNodes ?? 200000])
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error('XML 结构预算必须是正整数');
  const bytes = await source.readAll(context.signal),
    content = new TextContent(
      bytes,
      {
        ...options,
        mimeType: source.mimeType,
        encodingHint: xmlEncodingHint(bytes),
      },
      context.signal,
      async (task, payload, signal) => {
        if (task !== 'parse-xml') throw new Error('未知 XML 任务');
        const data = payload as {
          text: string;
          maxDepth: number;
          maxNodes: number;
        };
        return (await import('../parser/scanXml')).scanXml(
          data.text,
          data,
          signal,
        );
      },
    );
  const data = new XmlSession(content, options);
  try {
    await content.setEncoding(options.encoding ?? 'auto');
    return createSession({
      sessionId: context.sessionId,
      source,
      signal: context.signal,
      format: 'xml',
      data,
      dispose: () => {
        data.dispose();
        content.dispose();
      },
    });
  } catch (error) {
    data.dispose();
    content.dispose();
    throw error;
  }
}
