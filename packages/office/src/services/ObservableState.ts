import { notify } from '@filumo/core';
/** 只保存单份不可变快照；观察者只订阅，不持有并行状态副本。 */
export class ObservableState<T extends object> {
  private value: Readonly<T>;
  private closed = false;
  private listeners = new Set<() => void>();
  constructor(initial: T) {
    this.value = Object.freeze({ ...initial });
  }
  getSnapshot = (): Readonly<T> => this.value;
  subscribe = (listener: () => void) => {
    if (this.closed) return () => {};
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  update(change: Partial<T>) {
    if (
      this.closed ||
      Object.entries(change).every(
        ([key, value]) => this.value[key as keyof T] === value,
      )
    )
      return;
    this.value = Object.freeze({ ...this.value, ...change });
    notify(this.listeners);
  }
  dispose() {
    this.closed = true;
    this.listeners.clear();
  }
}
