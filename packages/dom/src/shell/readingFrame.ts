import type {
  CapabilityAction,
  ViewerCapabilities,
} from '../capabilities/types';
import type { ViewContext, ViewOptions } from '../contracts';
import { useStyles as acquireStyles } from '../styles';
import { createSelectControl } from './SelectControl';

/** 轻量阅读框架只提供状态和布局，不加载任何格式引擎或原文视图。 */
export function createReadingFrame(
  context: ViewContext,
  scope: string,
  group: string,
) {
  const document = context.container.ownerDocument;
  const release = acquireStyles(group, document, context.stylePolicy);
  const element = document.createElement('div');
  element.className = scope + ' fivo-reading-scope';
  const frame = document.createElement('section');
  frame.className = 'fivo-reading-frame';
  const body = document.createElement('div');
  body.className = 'fivo-reading-body';
  const status = document.createElement('div');
  status.className = 'fivo-reading-status';
  status.setAttribute('role', 'status');
  const watermark = document.createElement('div');
  watermark.className = 'fivo-reading-watermark';
  watermark.setAttribute('aria-hidden', 'true');
  frame.append(body, status, watermark);
  element.append(frame);
  context.container.append(element);
  let choice: ReturnType<typeof createSelectControl> | undefined;
  return {
    element,
    body,
    state(message: string, action?: CapabilityAction, error = false) {
      choice?.dispose();
      choice = undefined;
      status.replaceChildren();
      status.hidden = !message;
      body.hidden = !!message;
      status.setAttribute('role', error ? 'alert' : 'status');
      if (message) {
        const label = document.createElement('p');
        label.textContent = message;
        status.append(label);
      }
      if (action) {
        choice = createSelectControl(document, context.onError);
        choice.update(action, true);
        status.append(choice.element);
      }
    },
    publish(
      actions: CapabilityAction[],
      zoom?: ViewerCapabilities['zoom'],
      search?: ViewerCapabilities['search'],
    ) {
      context.setCapabilities({ actions, zoom, search });
    },
    update(options: ViewOptions) {
      watermark.textContent = options.watermark ?? '';
    },
    dispose() {
      choice?.dispose();
      element.remove();
      release();
    },
  };
}
