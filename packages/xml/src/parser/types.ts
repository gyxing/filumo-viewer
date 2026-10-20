export type XmlNodeKind =
  | 'document'
  | 'element'
  | 'attribute'
  | 'namespace'
  | 'text'
  | 'cdata'
  | 'comment'
  | 'processing';
export interface XmlNode {
  id: string;
  parentId?: string;
  childIds: string[];
  kind: XmlNodeKind;
  name?: string;
  namespaceUri?: string;
  start: number;
  end: number;
  value?: string;
  whitespace?: boolean;
  truncated?: boolean;
}
export interface XmlDocument {
  nodes: readonly XmlNode[];
  rootId: string;
}
export interface XmlDiagnostic {
  message: string;
  offset: number;
  line: number;
  column: number;
}
export type XmlParseResult =
  | { kind: 'ready'; document: XmlDocument }
  | { kind: 'invalid' | 'limited'; diagnostics: readonly XmlDiagnostic[] };
export interface XmlSourceAttribute {
  name: string;
  start: number;
  end: number;
  valueStart: number;
  valueEnd: number;
}
export interface XmlSourceToken {
  kind: 'open' | 'close' | 'text' | 'cdata' | 'comment' | 'processing';
  start: number;
  end: number;
  name?: string;
  valueStart?: number;
  valueEnd?: number;
  attributes?: XmlSourceAttribute[];
}
