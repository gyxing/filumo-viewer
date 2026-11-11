import type {
  ToolbarActionState,
  ToolbarIcon,
  ToolbarIconContext,
  ToolbarIconInstance,
} from '../capabilities/types';
import { createShellIcon, type ShellIcon } from './icons';

/** 管理一个显示位置的图标，布局移动不重复创建宿主资源。 */
export function createActionIcon(
  host: HTMLElement,
  placement: ToolbarIconContext['placement'],
  onError: (error: unknown) => void,
  onSizeChange?: () => void,
  className?: string,
) {
  let current: ShellIcon | ToolbarIcon | null | undefined;
  let element: Element | undefined;
  let instance: ToolbarIconInstance | undefined;
  let observer: ResizeObserver | undefined;
  let previousState: ToolbarActionState | undefined;
  const release = () => {
    observer?.disconnect();
    observer = undefined;
    const previous = instance;
    instance = undefined;
    try {
      previous?.dispose();
    } catch (error) {
      onError(error);
    } finally {
      element?.remove();
      element = undefined;
      current = undefined;
      previousState = undefined;
    }
  };
  return {
    update(icon: typeof current, action: ToolbarActionState) {
      const context: ToolbarIconContext = {
        document: host.ownerDocument,
        placement,
        action: {
          id: action.id,
          label: action.label,
          enabled: action.enabled,
          pressed: action.pressed,
          value: action.value,
        },
      };
      if (current !== icon) {
        release();
        current = icon;
        if (!icon) return false;
        previousState = context.action;
        if (typeof icon === 'string')
          element = createShellIcon(context.document, icon);
        else {
          const container = context.document.createElement('span');
          container.className = 'filumo-icon filumo-custom-icon';
          container.setAttribute('aria-hidden', 'true');
          element = container;
        }
        if (className) element.classList.add(className);
        host.prepend(element);
        if (typeof icon !== 'string') {
          try {
            instance = icon.mount(element as HTMLElement, context);
            const Resize = context.document.defaultView?.ResizeObserver;
            if (Resize && onSizeChange) {
              observer = new Resize(onSizeChange);
              observer.observe(element);
            }
          } catch (error) {
            release();
            onError(error);
          }
        }
        onSizeChange?.();
      } else if (
        previousState?.label !== action.label ||
        previousState?.enabled !== action.enabled ||
        previousState?.pressed !== action.pressed ||
        previousState?.value !== action.value ||
        previousState?.id !== action.id
      ) {
        previousState = context.action;
        try {
          instance?.update?.(context);
        } catch (error) {
          onError(error);
        }
      }
      return Boolean(element);
    },
    dispose: release,
  };
}
