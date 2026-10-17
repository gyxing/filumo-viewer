import type { ViewerPlugin } from '@fivo/dom';
import type { MarkdownOptions } from './options';
export type MarkdownFactory = (options?: MarkdownOptions) => ViewerPlugin;
