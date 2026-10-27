import type { ArchiveResourcePolicy } from '../options';
import type { ArchiveEntry, ArchiveFormat } from '../reader/contracts';
export interface ArchiveSourceInfo {
  id: number;
  name?: string;
  mimeType?: string;
  size?: number;
}
export interface ArchiveCommand {
  id: number;
  op: 'open' | 'extract';
  source: ArchiveSourceInfo;
  format: ArchiveFormat;
  policy: ArchiveResourcePolicy;
  used: number;
  entryId?: string;
  assetsBaseUrl?: string;
}
export type ArchiveReply =
  | { id: number; ok: true; entries?: ArchiveEntry[]; bytes?: Uint8Array }
  | { id: number; ok: false; message: string; code?: string };
export interface SourceRequest {
  sourceCall: number;
  sourceId: number;
  method:
    | 'range-info'
    | 'range'
    | 'stream-open'
    | 'stream-next'
    | 'stream-close'
    | 'usage';
  offset?: number;
  length?: number;
  streamId?: number;
  bytes?: number;
}
export interface SourceReply {
  sourceReply: number;
  ok: boolean;
  value?: unknown;
  message?: string;
  code?: string;
}
