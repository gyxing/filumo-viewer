/** 只缓存完整且校验成功的条目，按字节淘汰，不缓存超过预算的大条目。 */
export class EntryCache {
  private values = new Map<string, Uint8Array>();
  private bytes = 0;
  constructor(private maxBytes: number) {}
  get(id: string) {
    const value = this.values.get(id);
    if (value) {
      this.values.delete(id);
      this.values.set(id, value);
    }
    return value;
  }
  set(id: string, value: Uint8Array) {
    if (value.length > this.maxBytes) return;
    const old = this.values.get(id);
    if (old) this.bytes -= old.length;
    this.values.delete(id);
    this.values.set(id, value);
    this.bytes += value.length;
    for (const [key, entry] of this.values) {
      if (this.bytes <= this.maxBytes) break;
      this.values.delete(key);
      this.bytes -= entry.length;
    }
  }
  clear() {
    this.values.clear();
    this.bytes = 0;
  }
}
