import type { TextEncoding } from '@fivo/core/text';
export interface JsonOptions {
  variant?: 'auto' | 'json' | 'jsonc' | 'lines';
  maxRecords?: number;
  maxCachedRecords?: number;
  maxCachedNodes?: number;
  encoding?: TextEncoding;
  initialMode?: 'tree' | 'source';
  initialExpandDepth?: number;
  maxDepth?: number;
  maxNodes?: number;
  worker?: 'auto' | 'always' | 'never';
  workerFactory?: () => Worker;
}
