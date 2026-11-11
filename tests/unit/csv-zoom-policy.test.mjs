import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

const zoomModule = JSON.stringify(
  resolve('packages/dom/src/zoomOptions.ts').replaceAll('\\', '/'),
);
const bundle = await build({
  entryPoints: ['packages/csv/src/view/mountCsv.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  loader: { '.less': 'empty' },
  plugins: [
    {
      name: 'csv-view-boundaries',
      setup(builder) {
        builder.onResolve({ filter: /^@filumo\/dom$/ }, () => ({
          path: 'dom',
          namespace: 'fixture',
        }));
        builder.onResolve({ filter: /^\.\/CsvGrid$/ }, () => ({
          path: 'grid',
          namespace: 'fixture',
        }));
        builder.onResolve({ filter: /^@filumo\/dom\/text$/ }, () => ({
          path: 'text',
          namespace: 'fixture',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          resolveDir: process.cwd(),
          contents:
            path === 'dom'
              ? `
        export {resolveZoomOptions} from ${zoomModule};
        export function createReadingFrame(context) {
          const body=context.container.ownerDocument.createElement('div');
          return {body,update(){},state(){},notice(){},setActive(){},dispose(){},
            publish(actions,zoom,search){context.setCapabilities({actions,zoom,search});}};
        }`
              : path === 'grid'
              ? `
        export class CsvGrid {
          constructor(session,index,document,options,error,state,changed,layoutChanged) {
            this.document=document;this.options=options;this.changed=changed;this.layoutChanged=layoutChanged;
            this.element=document.createElement('section');document.grids.push(this);
          }
          get fitWidthZoom(){return this.document.measuredZoom;}
          get hasSelection(){return false;}
          setFitWidth(active){this.autoFit=active;}
          update(options){this.options=options;}
          setActive(){} dispose(){} resetColumnWidths(){} async copy(){} showSearch(){}
        }`
              : `export function mountTextSurface(){return{update(){},setActive(){},dispose(){},showSearch(){}};}`,
        }));
      },
    },
  ],
});
const { mountCsv } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

/** 隔离解析和绘制，验证真实CSV外壳的模式切换与配置生命周期。 */
async function fixture(options) {
  const document = {
    measuredZoom: 200,
    grids: [],
    createElement() {
      return {
        hidden: false,
        children: [],
        append(...nodes) {
          this.children.push(...nodes);
        },
      };
    },
  };
  const index = { rowStarts: [0, 10], columnCount: 2 };
  const session = {
    mode: 'table',
    header: false,
    delimiter: ',',
    pause() {},
    async ensureIndex() {
      return { kind: 'ready', index };
    },
    content: {
      revision: 1,
      document: { encoding: 'utf-8' },
      subscribe: () => () => {},
    },
  };
  let capabilities;
  const context = {
    container: { ownerDocument: document },
    options,
    session: { data: session },
    setCapabilities(value) {
      capabilities = value;
    },
    onError(error) {
      throw error;
    },
  };
  const view = await mountCsv(context);
  return {
    view,
    document,
    session,
    get capabilities() {
      return capabilities;
    },
    get grid() {
      return document.grids[0];
    },
  };
}
const settled = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

test('CSV自动上限100、手动150和普通配置更新按各自模式工作', async () => {
  const f = await fixture({ zoomMode: 'fit-width', fitMaxZoom: 100 });
  try {
    assert.equal(f.capabilities.zoom.value, 100);
    assert.equal(f.grid.autoFit, true);
    await f.capabilities.zoom.set(150);
    assert.equal(f.grid.autoFit, false);
    f.document.measuredZoom = 250;
    f.grid.layoutChanged();
    f.view.update({ locale: 'en-US' });
    await settled();
    assert.equal(f.capabilities.zoom.value, 150);
    assert.equal(f.capabilities.zoom.mode.value, 'percentage');
    f.view.update({ fitMaxZoom: 80 });
    await settled();
    assert.equal(f.capabilities.zoom.value, 150);
    await f.capabilities.zoom.mode.set('fit-width');
    assert.equal(f.capabilities.zoom.value, 80);
    f.document.measuredZoom = 60;
    f.grid.layoutChanged();
    assert.equal(f.capabilities.zoom.value, 60);
    f.grid.changed(true);
    assert.equal(f.capabilities.zoom.mode.value, 'percentage');
    assert.equal(f.capabilities.zoom.value, 60);
  } finally {
    await f.view.dispose();
  }
});

test('CSV默认100，原文视图保留当前比例，回表格恢复已选自动策略', async () => {
  const f = await fixture({});
  try {
    assert.equal(f.capabilities.zoom.value, 100);
    await f.capabilities.zoom.mode.set('fit-width');
    assert.equal(f.capabilities.zoom.value, 200);
    await f.capabilities.actions
      .find((action) => action.id === 'csv.mode')
      .run('source');
    assert.equal(f.capabilities.zoom.mode, undefined);
    assert.equal(f.capabilities.zoom.value, 200);
    f.document.measuredZoom = 75;
    await f.capabilities.actions
      .find((action) => action.id === 'csv.mode')
      .run('table');
    assert.equal(f.capabilities.zoom.value, 75);
    await assert.rejects(f.capabilities.zoom.set(400));
  } finally {
    await f.view.dispose();
  }
});
