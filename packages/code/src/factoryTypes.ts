import type { ViewerPlugin } from '@filumo/dom';
import type { CodeOptions } from './options';
export type CodeFactory = (options?: CodeOptions) => ViewerPlugin;
