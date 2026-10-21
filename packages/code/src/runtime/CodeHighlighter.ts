import { TextTaskClient } from '@filumo/core/text';
import type { TaskWorker } from '@filumo/core/text';
import type {
  CodeHighlightResult,
  HighlightPayload,
} from '../highlight/highlightTask';
/** 增强独占客户端，终止同步语法计算不会影响解码任务。 */
export class CodeHighlighter {
  private client?: TextTaskClient;
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private factory: () => TaskWorker, private timeout: number) {}
  async run(
    payload: HighlightPayload,
    signal: AbortSignal,
  ): Promise<CodeHighlightResult> {
    this.cancel();
    if (signal.aborted) return { kind: 'plain', reason: 'unavailable' };
    const own = (this.controller = new AbortController());
    const client = (this.client = new TextTaskClient({
      mode: 'always',
      factory: this.factory,
      executeLocal: async () => {
        throw new Error('高亮需要独立 Worker');
      },
    }));
    let timedOut = false;
    const cancel = () => own.abort();
    signal.addEventListener('abort', cancel, { once: true });
    const timer = (this.timer = setTimeout(() => {
      timedOut = true;
      own.abort();
      client.dispose();
    }, this.timeout));
    try {
      return await client.run<CodeHighlightResult>(
        'highlight-code',
        payload,
        own.signal,
      );
    } catch {
      return { kind: 'plain', reason: timedOut ? 'timeout' : 'unavailable' };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      client.dispose();
      if (this.controller === own) {
        this.client = undefined;
        this.controller = undefined;
        this.timer = undefined;
      }
    }
  }
  /** 终止专用线程，避免不可中断的第三方高亮继续占用 CPU。 */
  cancel() {
    this.controller?.abort();
    this.client?.dispose();
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.client = undefined;
    this.controller = undefined;
    this.timer = undefined;
  }
}
