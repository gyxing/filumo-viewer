import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';

const bundle = await build({
  stdin: {
    contents: `export {resolveZoomOptions} from './packages/dom/src/zoomOptions';
      export {applyOfficeZoomOptions} from './packages/office/src/runtime/applyViewZoom';
      export {createOfficeInteractions} from './packages/office/src/runtime/createOfficeInteractions';
      export {OfficeViewportService} from './packages/office/src/services/OfficeViewportService';
      export {CsvGrid} from './packages/csv/src/view/CsvGrid';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  loader: { '.less': 'empty' },
});
const {
  resolveZoomOptions,
  applyOfficeZoomOptions,
  createOfficeInteractions,
  OfficeViewportService,
  CsvGrid,
} = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
const defaults = {
  mode: 'fit-width',
  modes: ['percentage', 'fit-width'],
  minFitZoom: 1,
};

test('公开缩放配置保留格式默认、单独比例和明确模式优先级', () => {
  assert.equal(resolveZoomOptions({}, defaults).mode, 'fit-width');
  assert.equal(resolveZoomOptions({ zoom: 100 }, defaults).mode, 'percentage');
  assert.equal(
    resolveZoomOptions({ zoom: 150, zoomMode: 'fit-width' }, defaults).mode,
    'fit-width',
  );
  assert.equal(
    resolveZoomOptions({ zoom: 150, fitMaxZoom: 100 }, defaults).zoom,
    150,
  );
});

test('无效模式、非有限比例和低于格式范围的上限明确报错', () => {
  for (const options of [
    { zoomMode: 'fit-height' },
    { zoom: NaN },
    { zoom: 0 },
    { fitMaxZoom: Infinity },
    { fitMaxZoom: 0 },
  ])
    assert.throws(() => resolveZoomOptions(options, defaults));
  assert.throws(() =>
    resolveZoomOptions({ fitMaxZoom: 20 }, { ...defaults, minFitZoom: 25 }),
  );
  assert.throws(() => resolveZoomOptions({ zoomMode: 'fit-page' }, defaults));
});

test('Office普通更新和仅上限更新保留手动150，显式模式变更恢复自动', async () => {
  const port = createOfficeInteractions('docx');
  let maximum;
  const viewport = {
    setFitMaxZoom(value) {
      maximum = value;
    },
  };
  const options = { zoomMode: 'fit-width', fitMaxZoom: 100 };
  await applyOfficeZoomOptions(options, undefined, port, viewport);
  assert.equal(port.getState().zoomMode, 'fit-width');
  await port.execute({ type: 'zoom', value: 150 });
  await applyOfficeZoomOptions(
    { ...options, locale: 'en-US' },
    options,
    port,
    viewport,
  );
  assert.equal(port.getState().zoom, 150);
  assert.equal(port.getState().zoomMode, 'percentage');
  const changed = { ...options, fitMaxZoom: 80 };
  await applyOfficeZoomOptions(changed, options, port, viewport);
  assert.equal(maximum, 80);
  assert.equal(port.getState().zoom, 150);
  await applyOfficeZoomOptions(
    { ...changed, zoomMode: 'percentage', zoom: 100 },
    changed,
    port,
    viewport,
  );
  assert.equal(port.getState().zoom, 100);
  await applyOfficeZoomOptions(
    changed,
    { ...changed, zoomMode: 'percentage', zoom: 100 },
    port,
    viewport,
  );
  assert.equal(port.getState().zoomMode, 'fit-width');
  port.dispose();
});

test('Office原有默认值保留，Excel拒绝整页模式', async () => {
  for (const [kind, mode] of [
    ['docx', 'percentage'],
    ['xlsx', 'percentage'],
    ['pptx', 'fit-page'],
  ]) {
    const port = createOfficeInteractions(kind);
    try {
      await applyOfficeZoomOptions({}, undefined, port, { setFitMaxZoom() {} });
      assert.equal(port.getState().zoomMode, mode);
      if (kind === 'xlsx')
        await assert.rejects(
          applyOfficeZoomOptions({ zoomMode: 'fit-page' }, {}, port, {
            setFitMaxZoom() {},
          }),
        );
    } finally {
      port.dispose();
    }
  }
});

test('Office真实视口测量应用自动上限，手动模式和整页模式各按范围处理', async () => {
  const port = createOfficeInteractions('pptx');
  port.bind({});
  const jobs = new Map();
  const viewport = {
    clientWidth: 1600,
    clientHeight: 1200,
    getClientRects: () => [{}],
  };
  const target = {
    dataset: { officeFitBaseWidth: '800', officeFitBaseHeight: '600' },
  };
  const container = {
    ownerDocument: {
      defaultView: {
        addEventListener() {},
        removeEventListener() {},
        getComputedStyle: () => ({}),
      },
    },
    addEventListener() {},
    removeEventListener() {},
    querySelector: (selector) =>
      selector.startsWith('[data-office-fit-viewport') ? viewport : target,
    querySelectorAll: () => [],
  };
  viewport.ownerDocument = container.ownerDocument;
  const service = new OfficeViewportService(container, port, {
    schedule(key, read, write) {
      jobs.set(key, () => write(read()));
      return () => jobs.delete(key);
    },
  });
  const flush = () => {
    const pending = [...jobs.values()];
    jobs.clear();
    pending.forEach((run) => run());
  };
  try {
    await applyOfficeZoomOptions(
      { zoomMode: 'fit-width', fitMaxZoom: 100 },
      undefined,
      port,
      service,
    );
    flush();
    assert.equal(port.getState().zoom, 100);
    await port.execute({ type: 'zoom', value: 150 });
    service.setFitMaxZoom(80);
    flush();
    assert.equal(port.getState().zoom, 150);
    await port.execute({ type: 'zoomMode', mode: 'fit-page' });
    flush();
    assert.equal(port.getState().zoom, 80);
    viewport.clientWidth = 400;
    service.setFitMaxZoom(100);
    flush();
    assert.equal(port.getState().zoom, 50);
  } finally {
    service.dispose();
    port.dispose();
  }
});

test('CSV宽度测量依据整表和列宽覆盖，独立于当前缩放', () => {
  const measure = Object.getOwnPropertyDescriptor(
    CsvGrid.prototype,
    'fitWidthZoom',
  ).get;
  const grid = {
    index: { columnCount: 3 },
    viewport: { clientWidth: 480 },
    widths: new Map(),
  };
  assert.equal(measure.call(grid), 100);
  grid.widths.set(1, 320);
  assert.equal(measure.call(grid), 75);
  grid.viewport.clientWidth = 0;
  assert.equal(measure.call(grid), undefined);
});
