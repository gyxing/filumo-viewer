import type { ControllerSnapshot } from '@fivo/core';
import type { ViewerCapabilities, ViewerHandle } from '@fivo/dom';
import { json } from '@fivo/json';
import { markdown } from '@fivo/markdown';
import { office } from '@fivo/office';
import { text } from '@fivo/text';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { docsPath } from '../site-path';
import { redact, resetSmokeConfig } from './config';
import type { LogEntry, Sample, SmokeConfig, SmokeTarget } from './types';

/** 只以 source 驱动解析，切换测试对象时释放旧视图并保留当前文件。 */
export function useSmokeController() {
  const [config, setConfigState] = useState(resetSmokeConfig);
  const [target, setTargetState] = useState<SmokeTarget>('document');
  const [source, setSource] = useState<File>();
  const [selectedId, setSelectedId] = useState<string>();
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [generation, setGeneration] = useState(0);
  const [mounted, setMounted] = useState(true);
  const [active, setActiveState] = useState(true);
  const [state, setState] = useState<ControllerSnapshot>({ status: 'idle' });
  const [capabilities, setCapabilities] = useState<ViewerCapabilities>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const handle = useRef<ViewerHandle>(null);
  const serial = useRef(0);
  const sequence = useRef(0);
  const abort = useRef<AbortController>();
  const snapshotKey = useRef('');
  const log = useCallback((kind: string, value: unknown) => {
    const entry = {
      id: ++sequence.current,
      time: new Date().toISOString(),
      kind,
      message: redact(value),
    };
    setLogs((items) => [...items, entry].slice(-200));
  }, []);
  const plugins = useMemo(
    () => [
      office({
        ...config.office,
        onWarning: (warning) =>
          log('warning', warning.code + ': ' + warning.message),
        onHyperlinkActivate: (event) =>
          log('hyperlink', event.sourceType + ' / ' + event.sourceId),
      }),
      text(config.text),
      json(config.json),
      markdown(config.markdown),
    ],
    [config.office, config.text, config.json, config.markdown, log],
  );
  useEffect(
    () => () => {
      abort.current?.abort();
      serial.current++;
    },
    [],
  );
  const cancelSample = () => {
    abort.current?.abort();
    serial.current++;
    setSampleLoading(false);
  };
  const selectFile = (file?: File) => {
    if (!file) return;
    cancelSample();
    setSelectedId(undefined);
    setSourceError('');
    setSource(file);
    setTargetState('document');
    setMounted(true);
    setActiveState(true);
    snapshotKey.current = '';
    log('source', '打开本机文件：' + file.name);
  };
  const selectSample = async (sample: Sample) => {
    cancelSample();
    const id = serial.current;
    const controller = new AbortController();
    abort.current = controller;
    setSampleLoading(true);
    setSourceError('');
    log('source', '读取样本：' + sample.label);
    try {
      const response = await fetch(
        docsPath('__fivo_smoke/files/' + encodeURIComponent(sample.id)),
        { signal: controller.signal },
      );
      if (!response.ok)
        throw Error(
          '样本读取失败，请检查本机文件是否存在（HTTP ' +
            response.status +
            '）',
        );
      const bytes = await response.blob();
      if (id !== serial.current || controller.signal.aborted) return;
      setSource(
        new File(
          [bytes],
          sample.label.toLowerCase().endsWith('.' + sample.extension)
            ? sample.label
            : sample.label + '.' + sample.extension,
        ),
      );
      setSelectedId(sample.id);
      setTargetState('document');
      setMounted(true);
      setActiveState(true);
      snapshotKey.current = '';
    } catch (error) {
      if (!controller.signal.aborted && id === serial.current) {
        setSourceError(redact(error));
        log('error', error);
      }
    } finally {
      if (id === serial.current) setSampleLoading(false);
    }
  };
  const setConfig = (next: SmokeConfig) => {
    // 清空固定比例需要重新应用格式默认值，单次 update(undefined) 不会重置缩放模式。
    if (config.viewer.zoom !== undefined && next.viewer.zoom === undefined)
      setGeneration((n) => n + 1);
    setConfigState(next);
    log('config', '已更新预览参数');
  };
  const resetConfig = () => {
    if (config.viewer.zoom !== undefined) setGeneration((n) => n + 1);
    setConfigState(resetSmokeConfig());
    log('config', '已恢复默认参数，保留当前文件');
  };
  const setTarget = (next: SmokeTarget) => {
    if (next === target) return;
    cancelSample();
    setTargetState(next);
    setGeneration((n) => n + 1);
    setMounted(true);
    setActiveState(true);
    setCapabilities({});
    setState({ status: 'idle' });
    snapshotKey.current = '';
    log(
      'target',
      next === 'document' ? '切换到多格式文档预览' : '切换到独立 DOM 外壳',
    );
  };
  const updateState = (next: ControllerSnapshot) => {
    setState(next);
    const progress = next.progress;
    const percent =
      progress?.total && progress.loaded !== undefined
        ? Math.round((progress.loaded / progress.total) * 100)
        : undefined;
    // 相同阶段和百分比合并日志，避免渐进解析淹没错误与用户操作。
    const key = [next.status, progress?.phase, percent].join(':');
    if (key !== snapshotKey.current) {
      snapshotKey.current = key;
      log(
        progress ? 'progress' : 'state',
        progress
          ? progress.phase + (percent === undefined ? '' : ' ' + percent + '%')
          : '会话状态：' + next.status,
      );
    }
  };
  const destroy = async () => {
    cancelSample();
    try {
      await handle.current?.destroy();
    } catch (error) {
      log('error', error);
    } finally {
      setMounted(false);
      setState({ status: 'disposed' });
      setCapabilities({});
      log('dispose', '已销毁');
    }
  };
  const reopen = () => {
    setGeneration((n) => n + 1);
    setMounted(true);
    setActiveState(true);
    snapshotKey.current = '';
    log('action', '重新打开当前测试对象');
  };
  const setActive = (value: boolean) => {
    handle.current?.setActive(value);
    setActiveState(value);
    log('action', value ? '恢复预览' : '停用预览');
  };
  return {
    config,
    setConfig,
    resetConfig,
    target,
    setTarget,
    source,
    selectedId,
    selectFile,
    selectSample,
    sampleLoading,
    sourceError,
    generation,
    mounted,
    active,
    setActive,
    state,
    updateState,
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
