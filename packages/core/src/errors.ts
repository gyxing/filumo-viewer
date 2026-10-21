/** 为宿主提供稳定错误码，避免通过中文提示判断错误类型。 */
export class FilumoError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'FilumoError';
  }
}
/** 统一被替换或取消的加载任务，返回标准取消错误。 */
export function abortError(): Error {
  const error = new Error('文档加载已取消');
  error.name = 'AbortError';
  return error;
}
/** 在不可取消的读取完成后也检查信号，避免迟到结果继续渲染。 */
export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? abortError();
}
/** 观察者的异常不能中断其他订阅者或资源清理。 */
export function notify(listeners: ReadonlySet<() => void>): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* 外部观察者不拥有内部生命周期。 */
    }
  }
}
