import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const bundled = await build({
  stdin: {
    contents:
      'export {DisposalScope} from "./packages/office/src/services/lifetime/DisposalScope.ts"; export {createOfficeSearchService} from "./packages/office/src/services/OfficeSearchService.ts"; export {LayoutScheduler} from "./packages/office/src/layout/LayoutScheduler.ts"; export {OfficeResourceService} from "./packages/office/src/services/OfficeResourceService.ts"; export {createOfficeAnnotationService} from "./packages/office/src/services/OfficeAnnotationService.ts"; export {createMemoryOfficeAnnotationSource} from "./packages/office/src/engine/annotations/AnnotationSource.ts"; export {OfficeLinkService} from "./packages/office/src/services/OfficeLinkService.ts"; export {createOfficeViewServices} from "./packages/office/src/services/createOfficeViewServices.ts"; export {updateAttributes} from "./packages/office/src/view/dom/updateAttributes.ts"; export {VirtualWindow} from "./packages/office/src/layout/VirtualWindow.ts"; export {OfficeNavigationService} from "./packages/office/src/services/OfficeNavigationService.ts"; export {createOfficeInteractions} from "./packages/office/src/runtime/createOfficeInteractions.ts"; export {mountChart} from "./packages/office/src/view/shared/mountChart.ts"; export {mountImagePreview} from "./packages/office/src/view/shared/mountImagePreview.ts"; export {mountWatermark} from "./packages/office/src/view/shared/mountWatermark.ts";',
    resolveDir: process.cwd(),
  },
  write: false,
  bundle: true,
  format: 'esm',
  platform: 'node',
  metafile: true,
  logLevel: 'silent',
  loader: { '.less': 'empty' },
});
const {
  DisposalScope,
  createOfficeSearchService,
  LayoutScheduler,
  OfficeResourceService,
  createOfficeAnnotationService,
  createMemoryOfficeAnnotationSource,
  OfficeLinkService,
  updateAttributes,
  VirtualWindow,
  OfficeNavigationService,
  createOfficeInteractions,
} = await import(
  'data:text/javascript;base64,' +
    Buffer.from(bundled.outputFiles[0].text).toString('base64')
);
test('清理域倒序且幂等，异常不会中断其余资源清理', async () => {
  const calls = [];
  const scope = new DisposalScope();
  scope.add(() => calls.push(1));
  scope.add(() => {
    calls.push(2);
    throw Error('broken');
  });
  scope.add(async () => {
    calls.push(3);
  });
  const a = scope.dispose();
  assert.equal(a, scope.dispose());
  await assert.rejects(a);
  assert.deepEqual(calls, [3, 2, 1]);
});
test('搜索服务复用提供器，仅最后查询可以回写，销毁不处理迟到批次', async () => {
  const calls = [];
  const service = createOfficeSearchService({ delayMs: 0 });
  service.configure({ enabled: true, visible: true });
  service.actions.registerProvider({
    kind: 'word',
    search: async (q, emit, signal) => {
      calls.push({ q, emit, signal });
      await new Promise((resolve) =>
        signal.addEventListener('abort', resolve, { once: true }),
      );
    },
  });
  service.actions.setQuery('old');
  await new Promise((r) => setTimeout(r, 0));
  service.actions.setQuery('new');
  await new Promise((r) => setTimeout(r, 0));
  const hit = {
    id: 'new',
    matchText: 'new',
    previewText: 'new',
    target: { kind: 'word', blockId: 'p', startOffset: 0, endOffset: 3 },
  };
  calls[0].emit({
    items: [{ ...hit, id: 'old' }],
    scanned: 1,
    total: 1,
    complete: true,
  });
  calls[1].emit({ items: [hit], scanned: 1, total: 1, complete: true });
  assert.deepEqual(
    service.getSnapshot().results.map((r) => r.id),
    ['new'],
  );
  assert.equal(calls[0].signal.aborted, true);
  service.dispose();
  calls[1].emit({ items: [hit], scanned: 2, total: 2, complete: true });
  assert.equal(service.getSnapshot().results.length, 1);
});
test('布局调度按键合并，全部读取早于写入，停用保持任务', async () => {
  const order = [];
  const schedule = new LayoutScheduler();
  schedule.setActive(false);
  schedule.schedule(
    'a',
    () => {
      order.push('old');
      return 1;
    },
    () => {},
  );
  schedule.schedule(
    'a',
    () => {
      order.push('read-a');
      return 2;
    },
    () => order.push('write-a'),
  );
  schedule.schedule(
    'b',
    () => order.push('read-b'),
    () => order.push('write-b'),
  );
  await schedule.flush();
  assert.deepEqual(order, []);
  schedule.setActive(true);
  await schedule.flush();
  assert.deepEqual(order, ['read-a', 'read-b', 'write-a', 'write-b']);
  schedule.dispose();
});
test('服务与布局的传递运行时依赖不含 React/Vue', () => {
  assert.equal(
    Object.keys(bundled.metafile.inputs).some((file) =>
      /node_modules.*(?:react|vue)|compat\/react/.test(file),
    ),
    false,
  );
});

test('资源按 Document 隔离且租约幂等，取消加载不会留下 URL', async () => {
  let created = 0,
    revoked = 0,
    loads = 0;
  const document = {
    defaultView: {
      URL: {
        createObjectURL: () => 'blob:test-' + ++created,
        revokeObjectURL: () => {
          revoked++;
        },
      },
    },
  };
  const resources = new OfficeResourceService(document);
  const source = {
    kind: 'lazy',
    id: 'image',
    mimeType: 'image/png',
    size: 1,
    load: async () => {
      loads++;
      return new Blob(['x']);
    },
  };
  const [a, b] = await Promise.all([
    resources.acquire(source),
    resources.acquire(source),
  ]);
  assert.equal(a.url, b.url);
  assert.equal(loads, 1);
  a.release();
  a.release();
  assert.equal(revoked, 0);
  b.release();
  await resources.dispose();
  assert.equal(created, revoked);
  const another = new OfficeResourceService(document);
  const c = await another.acquire(source);
  assert.notEqual(c.url, a.url);
  c.release();
  await another.dispose();
  assert.equal(created, revoked);
});
test('批注服务切源后忽略旧读取，保留稳定 ID 与修订能力', async () => {
  const service = createOfficeAnnotationService();
  let complete;
  const stale = {
    getSnapshot: () => ({
      revision: 1,
      count: 1,
      revisionCount: 0,
      noteCount: 0,
      supportsRevisionModes: false,
    }),
    subscribe: () => () => {},
    getRange: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
    findIndexById: async () => 0,
  };
  service.actions.registerSource(stale);
  const loading = service.actions.loadRange(0, 1);
  const annotation = {
    id: 'current',
    target: { kind: 'word-range', blockId: 'p', startOffset: 0, endOffset: 1 },
    author: 'Filumo',
    text: 'comment',
  };
  service.actions.registerSource(
    createMemoryOfficeAnnotationSource({ annotations: [annotation] }),
  );
  complete([{ ...annotation, id: 'stale' }]);
  await loading;
  await service.actions.selectId('current');
  assert.equal(service.getSnapshot().activeAnnotation.id, 'current');
  assert.equal(service.actions.getCached(0).id, 'current');
  service.dispose();
});
test('链接服务阻止危险协议，站外地址不继承主文件认证', async () => {
  const opened = [],
    warnings = [];
  const service = new OfficeLinkService({
    document: {
      defaultView: {
        open: (...args) => {
          opened.push(args);
          return null;
        },
      },
    },
    file: new File([''], 'a.docx'),
    kind: 'docx',
    sourceUrl: 'https://user:secret@example.com/docs/a.docx',
    onWarning: (w) => warnings.push(w),
  });
  const request = (target) => ({
    hyperlink: { kind: 'external', target },
    source: { type: 'text', id: 'a' },
    mode: 'mouse',
  });
  await service.open(request('javascript:alert(1)'));
  assert.equal(opened.length, 0);
  assert.equal(warnings[0].code, 'HYPERLINK_BLOCKED');
  await service.open(request('../help'));
  assert.equal(opened[0][0], 'https://example.com/help');
  assert.equal(opened[0][2], 'noopener,noreferrer');
  service.dispose();
});
test('原生属性写入拒绝事件、脚本协议和控制字符绕过', () => {
  const element = { setAttribute() {}, removeAttribute() {} };
  assert.throws(() => updateAttributes(element, { onclick: 'bad' }));
  assert.throws(() =>
    updateAttributes(element, { href: ' java\nscript:alert(1)' }),
  );
  assert.doesNotThrow(() =>
    updateAttributes(element, { title: '<script>text</script>' }),
  );
});

test('布局任务在读阶段被替换后不执行旧写入', async () => {
  const calls = [];
  const scheduler = new LayoutScheduler();
  scheduler.schedule(
    'same',
    () => {
      scheduler.schedule(
        'same',
        () => 2,
        (value) => calls.push(value),
      );
      return 1;
    },
    (value) => calls.push(value),
  );
  await scheduler.flush();
  assert.deepEqual(calls, []);
  await scheduler.flush();
  assert.deepEqual(calls, [2]);
  scheduler.dispose();
});

test('虚拟窗口使用实际页面高度，并在高度修订后更新偏移', () => {
  const window = new VirtualWindow([100, 200, 50]);
  assert.deepEqual(window.range(110, 30, 0), {
    start: 1,
    end: 2,
    offset: 100,
    total: 350,
  });
  window.heights.replace(0, 150);
  assert.deepEqual(window.range(160, 30, 0), {
    start: 1,
    end: 2,
    offset: 150,
    total: 400,
  });
});
test('导航拒绝跨会话目标，文本目标使用已注册的定位能力', async () => {
  const port = createOfficeInteractions('docx');
  const selected = [];
  const service = new OfficeNavigationService(
    'current',
    port,
    async (target) => {
      selected.push(target);
      return true;
    },
  );
  await assert.rejects(
    service.select({
      sessionId: 'old',
      kind: 'text',
      target: { kind: 'word', blockId: 'p', startOffset: 0, endOffset: 1 },
    }),
    { code: 'STALE_TARGET' },
  );
  await service.select({
    sessionId: 'current',
    kind: 'text',
    target: { kind: 'word', blockId: 'p', startOffset: 0, endOffset: 1 },
  });
  assert.equal(selected.length, 1);
  service.dispose();
});
