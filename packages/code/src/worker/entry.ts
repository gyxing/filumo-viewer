import { decodeTextTask, serveTextTasks } from '@fivo/core/text';
import type { TextTaskScope } from '@fivo/core/text';
import type { HighlightPayload } from '../highlight/highlightTask';
serveTextTasks(globalThis as unknown as TextTaskScope, {
  decode: decodeTextTask,
  'highlight-code': async (payload, signal) =>
    (await import('../highlight/highlightTask')).highlightTask(
      payload as HighlightPayload,
      signal,
    ),
});
