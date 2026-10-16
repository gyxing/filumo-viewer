import type { EChartsType } from 'echarts/core';
import { buildOfficeChartOption } from '../../shared/chart/buildOfficeChartOption';
import type { OfficeChartModel } from '../../shared/chart/officeChartTypes';
import '../../styles/chart.less';
import type { OfficeRenderContext } from '../types';
import './shared.less';
let sequence = 0;
const registeredMaps = new Map<string, string>();
export interface ChartViewModel {
  chart: OfficeChartModel;
  width: number;
  height: number;
  zoom?: number;
}
/** 直接管理 ECharts 实例、静态降级和观察器；更新保留实例，不经过 React wrapper。 */
export function mountChart(
  container: HTMLElement,
  initial: ChartViewModel,
  context: OfficeRenderContext,
) {
  const host = context.document.createElement('div');
  host.className = 'office-file-chart fivo-chart-host';
  // 状态层独立于画布，避免 ECharts 初始化时清掉加载和错误提示。
  const canvasHost = context.document.createElement('div');
  canvasHost.className = 'office-file-chart__host';
  const status = context.document.createElement('div');
  status.setAttribute('role', 'status');
  status.hidden = true;
  host.append(canvasHost, status);
  container.append(host);
  const key = 'chart-' + ++sequence;
  let dirty = true;
  let model = initial,
    instance: EChartsType | undefined,
    closed = false,
    active = true,
    visible = false,
    version = 0;
  let loading: AbortController | undefined;
  let resize: ResizeObserver | undefined;
  let intersection: IntersectionObserver | undefined;
  let cancelLayout: (() => void) | undefined;
  let stopCapture: (() => void) | undefined;
  const setStatus = (text: string, busy = false) => {
    status.replaceChildren();
    status.className = busy
      ? 'office-file-chart__loading'
      : 'office-file-chart__empty';
    if (busy) {
      const spinner = context.document.createElement('span');
      spinner.className = 'office-file-chart__spinner';
      spinner.setAttribute('aria-hidden', 'true');
      status.append(spinner);
    }
    status.append(context.document.createTextNode(text));
    status.hidden = !text;
    host.setAttribute('aria-busy', String(busy));
  };
  const fallback = (text: string, allowSnapshot = true) => {
    stopCapture?.();
    instance?.dispose();
    instance = undefined;
    canvasHost.replaceChildren();
    host.classList.add('office-file-chart--static');
    if (allowSnapshot && model.chart.snapshotSrc) {
      const image = context.document.createElement('img');
      image.className = 'office-file-chart__snapshot';
      image.alt = model.chart.title ?? text;
      image.src = model.chart.snapshotSrc;
      canvasHost.hidden = false;
      canvasHost.append(image);
      setStatus('');
    } else {
      canvasHost.hidden = true;
      setStatus(text);
    }
  };
  const hasValidSize = () =>
    Number.isFinite(model.width) &&
    model.width > 0 &&
    Number.isFinite(model.height) &&
    model.height > 0;
  const dimensions = () => {
    const valid = hasValidSize();
    const scale = (model.zoom ?? 100) / 100;
    // 无效尺寸也预留空态空间，否则错误文字会被零宽高容器裁掉。
    const width =
      Number.isFinite(model.width) && model.width > 0 ? model.width : 160;
    const height =
      Number.isFinite(model.height) && model.height > 0 ? model.height : 72;
    host.classList.toggle('office-file-chart--invalid-size', !valid);
    host.style.width = width * scale + 'px';
    host.style.height = height * scale + 'px';
  };
  const render = async () => {
    if (closed || !active || !visible) return;
    const generation = ++version;
    stopCapture?.();
    loading?.abort();
    const controller = new AbortController();
    loading = controller;
    const chart = model.chart;
    dimensions();
    if (!hasValidSize()) {
      fallback(
        context.locale === 'en-US' ? 'Invalid chart size' : '图表尺寸无效',
        false,
      );
      return;
    }
    if (chart.renderMode === 'snapshot' && chart.snapshotSrc) {
      fallback('');
      return;
    }
    canvasHost.hidden = false;
    host.classList.remove('office-file-chart--static');
    setStatus(context.locale === 'en-US' ? 'Loading chart' : '正在加载图表', true);
    try {
      const module = await import(
        '../../shared/chart/runtime/loadOfficeEChartsRuntime'
      );
      const runtime = await module.ensureOfficeEChartsRuntime(chart);
      if (closed || controller.signal.aborted || generation !== version) return;
      let rendered = chart;
      if (chart.type === 'map') {
        if (!chart.mapGeoJsonUrl) {
          fallback(
            context.locale === 'en-US'
              ? 'Map data unavailable'
              : '地图数据不可用',
          );
          return;
        }
        const url = new URL(chart.mapGeoJsonUrl, context.document.baseURI);
        if (!['https:', 'http:'].includes(url.protocol))
          throw new Error('不支持的地图资源协议');
        url.username = '';
        url.password = '';
        let name = registeredMaps.get(url.href);
        if (!name) {
          const response = await fetch(url.href, {
            signal: controller.signal,
            credentials: 'omit',
          });
          if (!response.ok) throw new Error('地图资源加载失败');
          const geo = await response.json();
          if (closed || controller.signal.aborted || generation !== version)
            return;
          name = 'fivo-map-' + ++sequence;
          runtime.registerMap(name, geo);
          registeredMaps.set(url.href, name);
        }
        rendered = { ...chart, mapName: name };
      }
      if (!instance) {
        canvasHost.replaceChildren();
        instance = runtime.init(canvasHost, undefined, { renderer: 'canvas' });
      }
      const chartInstance = instance;
      if (chart.renderMode === 'snapshot') {
        const capture = () => {
          if (closed || instance !== chartInstance || generation !== version)
            return;
          stopCapture?.();
          try {
            const src = chartInstance.getDataURL({
              type: 'png',
              pixelRatio: 1,
              backgroundColor: '#fff',
            });
            chartInstance.dispose();
            instance = undefined;
            const image = context.document.createElement('img');
            image.src = src;
            image.alt = chart.title ?? '';
            image.className = 'office-file-chart__snapshot';
            canvasHost.replaceChildren(image);
            host.classList.add('office-file-chart--static');
            setStatus('');
          } catch {
            fallback(
              context.locale === 'en-US'
                ? 'Chart rendering failed'
                : '图表渲染失败',
            );
          }
        };
        stopCapture = () => {
          chartInstance.off('finished', capture);
          stopCapture = undefined;
        };
        chartInstance.on('finished', capture);
      }
      dirty = false;
      chartInstance.setOption(buildOfficeChartOption(rendered), {
        notMerge: true,
        lazyUpdate: chart.renderMode !== 'snapshot',
      });
      if (chart.renderMode !== 'snapshot') setStatus('');
    } catch (error) {
      if (!closed && !controller.signal.aborted && generation === version) {
        fallback(
          context.locale === 'en-US'
            ? 'Chart rendering failed'
            : '图表渲染失败',
        );
      }
    }
  };
  const window = context.document.defaultView;
  if (window?.ResizeObserver) {
    resize = new window.ResizeObserver(() => {
      cancelLayout = context.services.layout.schedule(
        key,
        () => [host.clientWidth, host.clientHeight],
        () => instance?.resize(),
      );
    });
    resize.observe(host);
  }
  if (window?.IntersectionObserver) {
    intersection = new window.IntersectionObserver((entries) => {
      const next = entries.some((entry) => entry.isIntersecting);
      if (next !== visible) {
        visible = next;
        if (next) {
          if (dirty || !instance) void render();
          else instance.resize();
        }
      }
    });
    intersection.observe(host);
  } else {
    visible = true;
    void render();
  }
  dimensions();
  const dispose = () => {
    if (closed) return;
    closed = true;
    version++;
    loading?.abort();
    cancelLayout?.();
    resize?.disconnect();
    intersection?.disconnect();
    stopCapture?.();
    instance?.dispose();
    instance = undefined;
    host.remove();
    context.signal.removeEventListener('abort', dispose);
  };
  context.signal.addEventListener('abort', dispose, { once: true });
  if (context.signal.aborted) dispose();
  return {
    async update(next: ChartViewModel) {
      model = next;
      dirty = true;
      dimensions();
      await render();
    },
    setActive(value: boolean) {
      if (active === value) return;
      active = value;
      host.hidden = !value;
      if (value) {
        if (dirty || !instance) void render();
        else instance.resize();
      } else {
        version++;
        loading?.abort();
        // 暂停时取消快照监听，重新激活后再完成渲染和加载状态。
        if (stopCapture) {
          dirty = true;
          stopCapture();
        }
      }
    },
    dispose,
  };
}
