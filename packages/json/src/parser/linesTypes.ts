export interface JsonLinesIndex {
  starts: Uint32Array;
  ends: Uint32Array;
  lineNumbers: Uint32Array;
  valid: Uint8Array;
}
export type JsonLinesResult =
  | { kind: 'ready'; index: JsonLinesIndex }
  | { kind: 'limited'; message: string; offset: number };
