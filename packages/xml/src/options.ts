import type { TaskWorker, TextEncoding } from '@fivo/core/text';
export interface XmlOptions {
  encoding?: TextEncoding;
  worker?: 'auto' | 'always' | 'never';
  workerFactory?: () => TaskWorker;
  initialMode?: 'tree' | 'source';
  maxDepth?: number;
  maxNodes?: number;
}
