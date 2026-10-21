import type { ViewerPlugin } from '@filumo/dom';
import type { PdfOptions } from './options';
export type PdfFactory = (options?: PdfOptions) => ViewerPlugin;
