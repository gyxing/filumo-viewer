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
  const fallback = (text: string) => {
    instance?.dispose();
    instance = undefined;
    host.replaceChildren();
    if (model.chart.snapshotSrc) {
      const image = context.document.createElement('img');
      image.className = 'office-file-chart__snapshot';
      image.alt = model.chart.title ?? text;
      image.src = model.chart.snapshotSrc;
      host.append(image);
    } else host.textContent = text;
  };
  const dimensions = () => {
    host.style.width =
      (Math.max(0, model.width) * (model.zoom ?? 100)) / 100 + 'px';
    host.style.height =
      (Math.max(0, model.height) * (model.zoom ?? 100)) / 100 + 'px';
  };
  const render = async () => {
    if (closed || !active || !visible) return;
    const generation = ++version;
    loading?.abort();
    const controller = new AbortController();
    loading = controller;
    const chart = model.chart;
    dimensions();
    if (model.width <= 0 || model.height <= 0) {
      fallback(
        context.locale === 'en-US' ? 'Invalid chart size' : '图表尺寸无效',
      );
      return;
    }
    if (chart.renderMode === 'snapshot' && chart.snapshotSrc) {
      fallback('');
      return;
    }
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
        host.replaceChildren();
        instance = runtime.init(host, undefined, { renderer: 'canvas' });
      }
      const chartInstance = instance;
      if (chart.renderMode === 'snapshot') {
        const capture = () => {
          if (closed || instance !== chartInstance || generation !== version)
            return;
          chartInstance.off('finished', capture);
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
          host.replaceChildren(image);
        };
        chartInstance.on('finished', capture);
      }
      dirty = false;
      chartInstance.setOption(buildOfficeChartOption(rendered), {
        notMerge: true,
        lazyUpdate: chart.renderMode !== 'snapshot',
      });
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
      }
    },
    dispose,
  };
}
