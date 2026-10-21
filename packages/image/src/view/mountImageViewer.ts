import type { ViewContext, ViewHandle } from '@filumo/dom';
import type { ImageSession } from '../runtime/ImageSession';
import { mountImageSurface } from './ImageSurface';

/** 独立图片只挂载内容视图，所有主操作通过统一能力工具栏提供。 */
export async function mountImageViewer(
  context: ViewContext,
): Promise<ViewHandle> {
  const data = context.session.data as ImageSession;
  let options = context.options;
  const surface = await mountImageSurface(
    context.container,
    {
      name: data.name,
      mimeType: data.blob.type,
      async resolve(signal) {
        if (signal.aborted) throw signal.reason;
        const api = context.container.ownerDocument.defaultView?.URL ?? URL;
        const url = api.createObjectURL(data.blob);
        let released = false;
        return {
          url,
          release() {
            if (!released) {
              released = true;
              api.revokeObjectURL(url);
            }
          },
        };
      },
    },
    {
      ...data.options,
      locale: options.locale,
      signal: context.session.signal,
      stylePolicy: context.stylePolicy,
    },
  );
  if (options.zoom !== undefined) surface.setScale(options.zoom / 100);
  const publish = () => {
    const state = surface.getSnapshot(),
      en = options.locale === 'en-US';
    context.setCapabilities({
      actions: [
        {
          id: 'image.fit',
          kind: 'toggle',
          label: en ? 'Fit image' : '适应容器',
          pressed: state.mode === 'fit',
          toolbar: { placement: 'main', order: 10, priority: Infinity },
          run: () => surface.fit(),
        },
        {
          id: 'image.actual',
          kind: 'toggle',
          label: en ? 'Actual size' : '原始尺寸',
          pressed: state.mode === 'actual',
          toolbar: { placement: 'main', order: 20, priority: Infinity },
          run: () => surface.actual(),
        },
        {
          id: 'image.rotate',
          kind: 'action',
          label: en ? 'Rotate' : '旋转',
          toolbar: { placement: 'main', order: 30, priority: Infinity },
          run: () => surface.rotate(),
        },
        {
          id: 'image.reset',
          kind: 'action',
          label: en ? 'Reset' : '复位',
          toolbar: { placement: 'main', order: 40, priority: Infinity },
          run: () => surface.reset(),
        },
        {
          id: 'image.retry',
          kind: 'action',
          label: en ? 'Retry' : '重试',
          toolbar: {
            visible: state.status === 'error',
            placement: 'main',
            order: 50,
            priority: Infinity,
          },
          run: () => surface.retry(),
        },
      ],
      zoom: {
        value: Math.round(state.scale * 1000) / 10,
        min: 1,
        max: 500,
        step: 10,
        toolbar: { placement: 'main', order: 0, priority: Infinity },
        async set(value) {
          surface.setScale(value / 100);
        },
      },
    });
  };
  const stop = surface.subscribe(publish);
  publish();
  return {
    update(next) {
      const zoomChanged = next.zoom !== options.zoom;
      options = next;
      surface.update({ locale: next.locale });
      if (zoomChanged && next.zoom !== undefined)
        surface.setScale(next.zoom / 100);
      publish();
    },
    setActive: surface.setActive,
    async dispose() {
      stop();
      await surface.dispose();
    },
  };
}
