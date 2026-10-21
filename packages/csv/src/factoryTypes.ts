import type { ViewerPlugin } from '@filumo/dom';
import type { CsvOptions } from './options';
export type CsvFactory = (options?: CsvOptions) => ViewerPlugin;
