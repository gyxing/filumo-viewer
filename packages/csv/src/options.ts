import type { TaskWorker, TextEncoding } from '@fivo/core/text';
/** 分隔符是工厂配置的一部分，公开声明不跟随内部解析模型。 */
export type CsvDelimiter = 'auto' | ',' | ';' | '\t' | '|';
export interface CsvOptions {
  encoding?: TextEncoding;
  worker?: 'auto' | 'always' | 'never';
  workerFactory?: () => TaskWorker;
  delimiter?: CsvDelimiter;
  header?: boolean;
  initialMode?: 'table' | 'source';
  maxRows?: number;
  maxColumns?: number;
  maxCachedCells?: number;
  cellCacheBytes?: number;
  maxCellDetailChars?: number;
}
