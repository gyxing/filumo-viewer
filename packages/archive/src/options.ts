export interface ArchiveResourcePolicy {
  maxEntries?: number;
  maxEntryBytes?: number;
  maxTotalUncompressedBytes?: number;
  maxNestedDepth?: number;
  cacheBytes?: number;
  maxWasmInputBytes?: number;
  maxFullReadBytes?: number;
}
export interface ArchiveOptions {
  resourcePolicy?: ArchiveResourcePolicy;
  workerFactory?: () => Worker;
  assetsBaseUrl?: string;
}
