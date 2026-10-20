import { readText } from './decodeText';
import type { TextEncoding, TextTaskHandler, TextTaskScope } from './types';

/** 解码任务只接受结构化字节和已知编码，宿主自定义 Worker 也遵守同一合同。 */
export async function decodeTextTask(payload: unknown, signal: AbortSignal) {
  const data = payload as {
    bytes?: unknown;
    encoding?: unknown;
    mimeType?: unknown;
    encodingHint?: unknown;
  };
  if (!data || !(data.bytes instanceof Uint8Array))
    throw new Error('文本任务字节无效');
  const encoding = data.encoding ?? 'auto';
  if (
    typeof encoding !== 'string' ||
    !['auto', 'utf-8', 'utf-16le', 'utf-16be', 'gbk', 'gb18030'].includes(
      encoding,
    )
  )
    throw new Error('文本编码无效');
  if (data.mimeType !== undefined && typeof data.mimeType !== 'string')
    throw new Error('文本来源类型无效');
  if (
    data.encodingHint !== undefined &&
    (typeof data.encodingHint !== 'string' ||
      !['utf-8', 'utf-16le', 'utf-16be', 'gbk', 'gb18030'].includes(
        data.encodingHint,
      ))
  )
    throw new Error('格式编码提示无效');
  return readText(data.bytes, {
    encoding: encoding as TextEncoding,
    mimeType: data.mimeType,
    encodingHint:
      typeof data.encodingHint === 'string' &&
      ['utf-8', 'utf-16le', 'utf-16be', 'gbk', 'gb18030'].includes(
        data.encodingHint,
      )
        ? (data.encodingHint as Exclude<TextEncoding, 'auto'>)
        : undefined,
    signal,
  });
}

/** Worker 只分发任务，格式解析器由对应 handler 在请求到来后动态导入。 */
export function serveTextTasks(
  scope: TextTaskScope,
  handlers: Record<string, TextTaskHandler>,
) {
  const running = new Map<number, AbortController>();
  scope.onmessage = (event) => {
    const data = event.data as {
      id?: unknown;
      task?: unknown;
      payload?: unknown;
      cancel?: unknown;
    };
    if (!data || typeof data.id !== 'number' || typeof data.task !== 'string')
      return;
    const { id, task } = data;
    if (data.cancel === true) {
      running.get(id)?.abort();
      return;
    }
    if (running.has(id)) return;
    const controller = new AbortController();
    running.set(id, controller);
    const handler = Object.prototype.hasOwnProperty.call(handlers, task)
      ? handlers[task]
      : undefined;
    void Promise.resolve()
      .then(() => {
        if (!handler) throw new Error('未知文本任务');
        return handler(data.payload, controller.signal);
      })
      .then(
        (value) => {
          if (!controller.signal.aborted)
            scope.postMessage({ id, task, ok: true, value });
        },
        (error) =>
          !controller.signal.aborted &&
          scope.postMessage({
            id,
            task,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }),
      )
      .finally(() => {
        if (running.get(id) === controller) running.delete(id);
      });
  };
}
