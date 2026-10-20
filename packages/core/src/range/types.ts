/** 来源持有的高效区间读取能力，长度已知；返回值不与可变下载缓冲共享所有权。 */
export interface DocumentRangeReader {
  readonly length: number;
  read(
    offset: number,
    length: number,
    signal: AbortSignal,
  ): Promise<Uint8Array>;
}
