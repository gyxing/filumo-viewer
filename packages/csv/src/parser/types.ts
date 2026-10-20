import type { CsvDelimiter } from '../options';
export type { CsvDelimiter } from '../options';
export interface CsvIndex {
  delimiter: Exclude<CsvDelimiter, 'auto'>;
  rowStarts: Uint32Array;
  rowEnds: Uint32Array;
  columnCount: number;
}
export interface CsvCell {
  start: number;
  end: number;
  quoted: boolean;
  column: number;
}
export interface CsvDiagnostic {
  message: string;
  offset: number;
}
export type CsvParseResult =
  | { kind: 'ready'; index: CsvIndex }
  | { kind: 'invalid' | 'limited'; diagnostics: readonly CsvDiagnostic[] };
export interface CsvParseOptions {
  delimiter: CsvDelimiter;
  maxRows: number;
  maxColumns: number;
}
