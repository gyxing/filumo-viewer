import type { ViewerPlugin } from '@filumo/dom';
import type { ArchiveOptions } from './options';
export type ArchiveFactory = (options?: ArchiveOptions) => ViewerPlugin;
