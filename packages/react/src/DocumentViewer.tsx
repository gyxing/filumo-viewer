import type { DocumentInput } from '@filumo/core';
import { notify } from '@filumo/core';
import type {
  ViewerConfiguration,
  ViewerHandle,
  ViewerOptions,
  ViewerPlugin,
} from '@filumo/dom';
import { createViewer } from '@filumo/dom';
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

export interface DocumentViewerProps
  extends Pick<
    ViewerOptions,
    'onReady' | 'onError' | 'onStateChange' | 'onCapabilitiesChange'
  > {
  source?: DocumentInput;
  plugins: readonly ViewerPlugin[];
  options?: ViewerConfiguration;
  className?: string;
}
/** React 只拥有宿主容器，文档内容和生命周期由框架无关查看器管理。 */
export const DocumentViewer = forwardRef<ViewerHandle, DocumentViewerProps>(
  function DocumentViewer(props, ref) {
    const host = useRef<HTMLDivElement>(null);
    const viewer = useRef<ViewerHandle>();
    const listeners = useRef(new Set<() => void>());
    const capabilityListeners = useRef(new Set<() => void>());
    const latest = useRef(props);
    latest.current = props;
    const configurationKey = JSON.stringify([
      props.options?.pluginId,
      props.options?.resourcePolicy,
      props.options?.stylePolicy,
    ]);
    useEffect(
      () => () => {
        listeners.current.clear();
        capabilityListeners.current.clear();
      },
      [],
    );
    useImperativeHandle(
      ref,
      () => ({
        open: (input, selection) =>
          viewer.current?.open(input, selection) ??
          Promise.reject(new Error('查看器尚未挂载')),
        update: (options) => viewer.current?.update(options),
        setActive: (active) => viewer.current?.setActive(active),
        getSnapshot: () => viewer.current?.getSnapshot() ?? { status: 'idle' },
        getCapabilities: () => viewer.current?.getCapabilities() ?? {},
        subscribeCapabilities: (listener) => {
          capabilityListeners.current.add(listener);
          return () => {
            capabilityListeners.current.delete(listener);
          };
        },
        subscribe: (listener) => {
          listeners.current.add(listener);
          return () => {
            listeners.current.delete(listener);
          };
        },
        destroy: () => viewer.current?.destroy() ?? Promise.resolve(),
      }),
      [],
    );
    useEffect(() => {
      if (!host.current) return;
      const instance = createViewer(host.current, {
        ...latest.current.options,
        plugins: props.plugins,
        onReady: (session) => latest.current.onReady?.(session),
        onCapabilitiesChange: (capabilities) => {
          notify(capabilityListeners.current);
          latest.current.onCapabilitiesChange?.(capabilities);
        },
        onError: (error) => latest.current.onError?.(error),
        onStateChange: (state) => {
          notify(listeners.current);
          latest.current.onStateChange?.(state);
        },
      });
      viewer.current = instance;
      return () => {
        viewer.current = undefined;
        void instance
          .destroy()
          .catch((error) => latest.current.onError?.(error));
      };
    }, [props.plugins, configurationKey]);
    useEffect(() => {
      if (props.source !== undefined) {
        /* 错误已由查看器状态和 onError 统一上报。 */ void viewer.current
          ?.open(props.source)
          .catch(() => undefined);
      }
    }, [props.source, props.plugins, configurationKey]);
    useEffect(() => {
      viewer.current?.update(props.options ?? {});
    }, [props.options]);
    return <div ref={host} className={props.className} />;
  },
);
