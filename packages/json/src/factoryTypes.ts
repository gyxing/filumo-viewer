import type { ViewerPlugin } from '@filumo/dom';
import type { JsonOptions } from './options';
export type JsonFactory = (options?: JsonOptions) => ViewerPlugin;
