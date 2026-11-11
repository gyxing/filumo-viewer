import type { DocumentInput } from '@filumo/core';
import { notify } from '@filumo/core';
import type {
  ViewerHandle as DomViewerHandle,
  ViewerPlugin,
} from '@filumo/dom';
import { createViewer } from '@filumo/dom';
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import type {
  ViewerConfiguration,
  ViewerHandle,
  ViewerOptions,
} from './toolbarIcons';
import { useToolbarIcons } from './toolbarIcons';

export interface DocumentViewerProps
  extends Pick<
    ViewerOptions,
    | 'onReady'
    | 'onError'
    | 'onStateChange'
    | 'onCapabilitiesChange'
    | 'downloadOriginal'
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
    const viewer = useRef<DomViewerHandle>();
    const listeners = useRef(new Set<() => void>());
    const capabilityListeners = useRef(new Set<() => void>());
    const latest = useRef(props);
    const icons = useToolbarIcons();
    // 只有提交后的 props 才能被已挂载查看器观察，丢弃的并发渲染不能替换回调。
    useLayoutEffect(() => {
      latest.current = props;
    });
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
        update: (options) => viewer.current?.update(icons.convert(options)),
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
        ...icons.convert(latest.current.options ?? {}),
        plugins: props.plugins,
        // 按当前提交的回调接管下载，回调更新不重建文档会话。
        downloadOriginal: props.downloadOriginal
          ? (source, signal) =>
              latest.current.downloadOriginal?.(source, signal) ??
              Promise.reject(new Error('原件下载处理器已移除'))
          : undefined,
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
    }, [props.plugins, configurationKey, Boolean(props.downloadOriginal)]);
    useEffect(() => {
      if (props.source !== undefined) {
        /* 错误已由查看器状态和 onError 统一上报。 */ void viewer.current
          ?.open(props.source)
          .catch(() => undefined);
      }
    }, [props.source, props.plugins, configurationKey]);
    useEffect(() => {
      viewer.current?.update(icons.convert(props.options ?? {}));
    }, [props.options]);
    return (
      <>
        <div ref={host} className={props.className} />
        {icons.render()}
      </>
    );
  },
);
