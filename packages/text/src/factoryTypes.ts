import type { ViewerPlugin } from '@filumo/dom';
import type { TextOptions } from './options';
export type TextFactory = (options?: TextOptions) => ViewerPlugin;
