import type { TextTaskScope } from '@fivo/text/reader';
import { decodeTextTask, serveTextTasks } from '@fivo/text/reader';
// 只解码原文时，Worker 也不会请求 Markdown 引擎。
serveTextTasks(globalThis as unknown as TextTaskScope, {
  decode: decodeTextTask,
  'parse-markdown': async (payload, signal) => {
    const data = payload as { text: string };
    if (!data || typeof data.text !== 'string')
      throw new Error('Markdown 任务文本无效');
    return (await import('../parser/parseMarkdown')).parseMarkdown(
      data.text,
      signal,
    );
  },
});
