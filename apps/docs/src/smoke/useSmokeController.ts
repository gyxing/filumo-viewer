import type { ControllerSnapshot } from '@fivo/core';
import type { ViewerCapabilities, ViewerHandle } from '@fivo/dom';
import { office } from '@fivo/office';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { docsPath } from '../site-path';
import { initialConfig, redact } from './config';
import type { LogEntry, Sample } from './types';
/** 只以 source 驱动解析；手动重开通过组件实例重建，不重复调用 ref.open。 */
export function useSmokeController() {
  const [config, setConfig] = useState(initialConfig),
    [source, setSource] = useState<File>(),
    [generation, setGeneration] = useState(0),
    [mounted, setMounted] = useState(true),
    [active, setActiveState] = useState(true),
    [state, setState] = useState<ControllerSnapshot>({ status: 'idle' }),
    [capabilities, setCapabilities] = useState<ViewerCapabilities>({}),
    [logs, setLogs] = useState<LogEntry[]>([]);
  const handle = useRef<ViewerHandle>(null),
    serial = useRef(0),
    sequence = useRef(0),
    abort = useRef<AbortController>();
  const log = useCallback(
    (kind: string, value: unknown) =>
      setLogs((items) =>
        [
          ...items,
          { id: ++sequence.current, kind, message: redact(value) },
        ].slice(-200),
      ),
    [],
  );
  const plugins = useMemo(
    () => [
      office({
        ...config.office,
        onWarning: (warning) =>
          log('warning', warning.code + ': ' + warning.message),
        onHyperlinkActivate: (event) => log('hyperlink', event.sourceType),
      }),
    ],
    [config.office, log],
  );
  useEffect(
    () => () => {
      abort.current?.abort();
      serial.current++;
    },
    [],
  );
  const selectFile = (file?: File) => {
    abort.current?.abort();
    serial.current++;
    if (!file) return;
    setSource(file);
    setMounted(true);
    setActiveState(true);
    log('source', file.name);
  };
  const selectSample = async (sample: Sample) => {
    abort.current?.abort();
    const id = ++serial.current;
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch(
        docsPath('__fivo_smoke/files/' + encodeURIComponent(sample.id)),
        { signal: controller.signal },
      );
      if (!response.ok) throw Error('样本读取失败');
      const bytes = await response.blob();
      if (id !== serial.current) return;
      setSource(
        new File(
          [bytes],
          sample.label.endsWith('.' + sample.extension)
            ? sample.label
            : sample.label + '.' + sample.extension,
        ),
      );
      setMounted(true);
      setActiveState(true);
    } catch (error) {
      if (!controller.signal.aborted) log('error', error);
    }
  };
  const destroy = async () => {
    abort.current?.abort();
    serial.current++;
    await handle.current?.destroy();
    setMounted(false);
    setState({ status: 'disposed' } as ControllerSnapshot);
    setCapabilities({});
    log('dispose', '已销毁');
  };
  const reopen = () => {
    setGeneration((n) => n + 1);
    setMounted(true);
    setActiveState(true);
  };
  const setActive = (value: boolean) => {
    handle.current?.setActive(value);
    setActiveState(value);
  };
  return {
    config,
    setConfig,
    source,
    selectFile,
    selectSample,
    generation,
    mounted,
    active,
    setActive,
    state,
    setState,
    capabilities,
    setCapabilities,
    logs,
    log,
    clearLogs: () => setLogs([]),
    handle,
    plugins,
    destroy,
    reopen,
  };
}
