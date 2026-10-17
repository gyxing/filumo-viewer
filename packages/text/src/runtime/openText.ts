import type { DocumentSource, OpenContext } from '@fivo/core';
import { createSession } from '@fivo/core';
import type { TextOptions } from '../options';
import { TextContent } from '../reader/TextContent';
export interface TextSessionData {
  content: TextContent;
  options: TextOptions;
}
/** 解码状态属于格式内部，未知编码也可交付可恢复的会话。 */
export async function openText(
  source: DocumentSource,
  context: OpenContext,
  options: TextOptions & { workerFactory: () => Worker },
) {
  context.reportProgress({ phase: '读取文本', loaded: 0, total: 1 });
  // 响应头在 readAll 后才可用，必须按此顺序采集 charset。
  const content = new TextContent(
    await source.readAll(context.signal),
    { ...options, mimeType: source.mimeType },
    context.signal,
  );
  try {
    await content.setEncoding(options.encoding ?? 'auto');
    context.reportProgress(undefined);
    return createSession<TextSessionData>({
      sessionId: context.sessionId,
      source,
      signal: context.signal,
      format: 'text',
      data: { content, options },
      dispose: content.dispose,
    });
  } catch (error) {
    content.dispose();
    throw error;
  }
}
