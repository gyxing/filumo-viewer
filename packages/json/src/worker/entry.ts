import type { TextTaskScope } from '@filumo/core/text';
import { decodeTextTask, serveTextTasks } from '@filumo/core/text';
// Worker 入口保留格式任务的动态边界，原文模式只运行 decode。
serveTextTasks(globalThis as unknown as TextTaskScope, {
  decode: decodeTextTask,
  'parse-json': async (payload, signal) => {
    const data = payload as {
      text: string;
      maxDepth: number;
      maxNodes: number;
      variant?: 'json' | 'jsonc';
    };
    if (!data || typeof data.text !== 'string')
      throw new Error('JSON 任务文本无效');
    return (await import('../parser/scanJson')).scanJson(
      data.text,
      data,
      signal,
    );
  },
  'index-json-lines': async (payload, signal) => {
    const data = payload as {
      text: string;
      maxRecords: number;
      maxDepth: number;
      maxNodes: number;
    };
    if (!data || typeof data.text !== 'string')
      throw new Error('JSON 记录任务无效');
    return (await import('../parser/scanJsonLines')).scanJsonLines(
      data.text,
      data,
      signal,
    );
  },
});
