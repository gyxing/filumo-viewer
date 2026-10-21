import { decodeTextTask, serveTextTasks } from '@filumo/core/text';
import type { TextTaskScope } from '@filumo/core/text';
serveTextTasks(globalThis as unknown as TextTaskScope, {
  decode: decodeTextTask,
  'parse-xml': async (payload, signal) => {
    const data = payload as {
      text: string;
      maxDepth: number;
      maxNodes: number;
    };
    if (!data || typeof data.text !== 'string') throw new Error('XML 任务无效');
    return (await import('../parser/scanXml')).scanXml(data.text, data, signal);
  },
});
