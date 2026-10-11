import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const bundled = await build({
  stdin: {
    contents:
      'export {SlideRequestController} from "./packages/office/src/renderers/presentation/SlideRequestController.ts";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const { SlideRequestController } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundled.outputFiles[0].text).toString('base64')
);
test('连续选页只交付最后结果并释放旧窗口，备注独立取消', async () => {
  const reads = [],
    releases = [];
  const source = {
    getSnapshot: () => ({ slideCount: 3 }),
    retainRange: (start, end) => () => releases.push([start, end]),
    ensureRange: async () => {},
    getSlide: (index, signal) =>
      new Promise((resolve) => reads.push({ index, signal, resolve })),
    getSpeakerNotes: async () => ({ paragraphs: [] }),
    retry() {},
  };
  const controller = new SlideRequestController(source);
  const a = controller.select(0).catch((error) => error);
  const b = controller.select(2);
  reads[1].resolve({ id: 'last', index: 2 });
  await b;
  reads[0].resolve({ id: 'old', index: 0 });
  assert.equal((await a).name, 'AbortError');
  assert.equal(controller.getSnapshot().slide.id, 'last');
  assert.equal(reads[0].signal.aborted, true);
  assert.equal(releases.length, 1);
  await controller.showNotes(true);
  assert.ok(controller.getSnapshot().notes);
  await controller.showNotes(false);
  assert.equal(controller.getSnapshot().notes, undefined);
  controller.dispose();
  assert.equal(releases.length, 2);
});
