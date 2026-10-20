import type { ViewerPlugin } from '@fivo/dom';
import type { PdfOptions } from './options';
export type PdfFactory = (options?: PdfOptions) => ViewerPlugin;
