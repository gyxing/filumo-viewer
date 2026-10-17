import type { TextEncoding } from '@fivo/text/reader';
export interface JsonOptions {
  encoding?: TextEncoding;
  initialMode?: 'tree' | 'source';
  initialExpandDepth?: number;
  maxDepth?: number;
  maxNodes?: number;
  worker?: 'auto' | 'always' | 'never';
  workerFactory?: () => Worker;
}
