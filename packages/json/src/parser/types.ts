export type JsonNodeType =
  | 'object'
  | 'array'
  | 'property'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null';
export interface JsonNode {
  id: string;
  type: JsonNodeType;
  start: number;
  end: number;
  parentId?: string;
  childIds: string[];
  key?: string;
  keyRange?: { start: number; end: number };
}
export interface JsonDiagnostic {
  message: string;
  offset: number;
  line: number;
  column: number;
  severity: 'error' | 'warning';
}
export interface JsonDocument {
  text: string;
  nodes: readonly JsonNode[];
  rootId: string;
  diagnostics: readonly JsonDiagnostic[];
}
export type JsonParseResult =
  | { kind: 'ready'; document: JsonDocument }
  | { kind: 'invalid'; text: string; diagnostics: readonly JsonDiagnostic[] };
