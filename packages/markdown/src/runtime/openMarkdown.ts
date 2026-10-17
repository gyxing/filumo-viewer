import type { DocumentSource, OpenContext } from '@fivo/core';
import { createSession } from '@fivo/core';
import { TextContent } from '@fivo/text/reader';
import type { MarkdownOptions } from '../options';
import { MarkdownSession } from './MarkdownSession';
/** 解码先于文档排版，原文初始模式不调用 Marked。 */
export async function openMarkdown(
  source: DocumentSource,
  context: OpenContext,
  options: MarkdownOptions & { workerFactory: () => Worker },
) {
  if (
    !Number.isInteger(options.maxHighlightChars ?? 65536) ||
    (options.maxHighlightChars ?? 65536) < 0
  )
    throw new Error('代码高亮字符上限必须是非负整数');
  // 响应头在 readAll 后才可用，必须按此顺序采集 charset。
  const content = new TextContent(
    await source.readAll(context.signal),
    { ...options, mimeType: source.mimeType },
    context.signal,
    async (task, payload, signal) => {
      if (task !== 'parse-markdown') throw new Error('未知 Markdown 任务');
      return (await import('../parser/parseMarkdown')).parseMarkdown(
        (payload as { text: string }).text,
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
      format: 'markdown',
      data: new MarkdownSession(content, options),
      dispose: content.dispose,
    });
  } catch (error) {
    content.dispose();
    throw error;
  }
}
