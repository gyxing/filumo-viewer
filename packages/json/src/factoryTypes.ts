import type { ViewerPlugin } from '@fivo/dom';
import type { JsonOptions } from './options';
export type JsonFactory = (options?: JsonOptions) => ViewerPlugin;
