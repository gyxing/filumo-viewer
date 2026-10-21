import type { ViewerPlugin } from '@filumo/dom';
import type { MarkdownOptions } from './options';
export type MarkdownFactory = (options?: MarkdownOptions) => ViewerPlugin;
