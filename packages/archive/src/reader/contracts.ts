import type { DocumentSource } from '@filumo/core';
import type { ArchiveBudget } from './ArchiveBudget';
export type ArchiveFormat =
  | 'zip'
  | 'tar'
  | 'gzip'
  | 'targz'
  | 'rar'
  | '7z'
  | 'tarxz';
export interface ArchiveEntry {
  id: string;
  path: string;
  kind: 'file' | 'directory' | 'unsupported';
  size: number;
  compressedSize?: number;
  modified?: number;
  error?: string;
}
export interface ArchiveReader {
  scan(signal: AbortSignal): AsyncIterable<ArchiveEntry>;
  openEntry(
    id: string,
    signal: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>>;
  close(): Promise<void>;
}
export interface ReaderContext {
  source: DocumentSource;
  budget: ArchiveBudget;
  format: ArchiveFormat;
  assetsBaseUrl?: string;
  signal: AbortSignal;
}
