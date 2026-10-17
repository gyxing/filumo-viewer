export type TextEncoding =
  | 'auto'
  | 'utf-8'
  | 'utf-16le'
  | 'utf-16be'
  | 'gbk'
  | 'gb18030';
export interface TextDocument {
  text: string;
  encoding: Exclude<TextEncoding, 'auto'>;
  lineStarts: Uint32Array;
  newline: 'none' | 'lf' | 'crlf' | 'cr' | 'mixed';
}
export type TextReadResult =
  | { kind: 'ready'; document: TextDocument }
  | { kind: 'needs-encoding'; reason: string };
export interface TextMatch {
  start: number;
  end: number;
  line: number;
}
export interface TextSearchOptions {
  matchCase: boolean;
  wholeWord: boolean;
}
/** 结构合同不引用 DOM 类型，读取入口也可在 Node 和 Worker 中导入。 */
export interface TaskWorker {
  postMessage(message: unknown): void;
  addEventListener(
    type: 'message',
    listener: (event: { data: unknown }) => void,
  ): void;
  addEventListener(
    type: 'error' | 'messageerror',
    listener: (event: unknown) => void,
  ): void;
  removeEventListener(
    type: 'message',
    listener: (event: { data: unknown }) => void,
  ): void;
  removeEventListener(
    type: 'error' | 'messageerror',
    listener: (event: unknown) => void,
  ): void;
  terminate(): void;
}
export interface TextTaskScope {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(message: unknown): void;
}
export type TextTaskHandler = (
  payload: unknown,
  signal: AbortSignal,
) => Promise<unknown>;
