/** 对一组资源按逆序释放，清理异常合并报告，不跳过剩余资源。 */
export class DisposalScope {
  private entries = new Set<() => void | Promise<unknown>>();
  private result?: Promise<void>;
  add(dispose: () => void | Promise<unknown>): () => void {
    if (this.result) throw new Error('不能向已关闭的清理域注册资源');
    this.entries.add(dispose);
    return () => {
      this.entries.delete(dispose);
    };
  }
  dispose(): Promise<void> {
    if (this.result) return this.result;
    this.result = Promise.resolve().then(async () => {
      const errors: unknown[] = [];
      const entries = [...this.entries].reverse();
      this.entries.clear();
      for (const dispose of entries) {
        try {
          await dispose();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length)
        throw new AggregateError(errors, 'Office 资源清理失败');
    });
    return this.result;
  }
}
