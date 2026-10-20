import type { ViewerPlugin } from '@fivo/dom';
import type { ImageOptions } from './options';
export type ImageFactory = (options?: ImageOptions) => ViewerPlugin;
