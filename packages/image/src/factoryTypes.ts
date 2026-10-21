import type { ViewerPlugin } from '@filumo/dom';
import type { ImageOptions } from './options';
export type ImageFactory = (options?: ImageOptions) => ViewerPlugin;
