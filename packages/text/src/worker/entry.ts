import { decodeTextTask, serveTextTasks } from '../reader/tasks';
import type { TextTaskScope } from '../reader/types';
// 此入口只在 Worker 上下文运行，类型不依赖与 DOM 冲突的全局声明。
serveTextTasks(globalThis as unknown as TextTaskScope, {
  decode: decodeTextTask,
});
