import type { ViewerPlugin } from '@fivo/dom';
import type { CodeOptions } from './options';
export type CodeFactory = (options?: CodeOptions) => ViewerPlugin;
