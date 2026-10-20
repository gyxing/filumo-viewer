import type { ViewerPlugin } from '@fivo/dom';
import type { CsvOptions } from './options';
export type CsvFactory = (options?: CsvOptions) => ViewerPlugin;
