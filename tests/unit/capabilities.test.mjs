import { build } from 'esbuild';
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

const bundle = await build({
  stdin: {
    contents:
      'export {createOfficeInteractions} from "./packages/office/src/runtime/createOfficeInteractions.ts"; export {createOfficeCapabilities} from "./packages/office/src/runtime/capabilities.ts"; export {exportOriginal} from "./packages/core/src/exportOriginal.ts";',
    resolveDir: path.resolve('.'),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  logLevel: 'silent',
});
const { createOfficeInteractions, createOfficeCapabilities, exportOriginal } =
  await import(
    'data:text/javascript;base64,' +
      Buffer.from(bundle.outputFiles[0].text).toString('base64')
  );

test('Office 交互只有一个状态源，重复赋值不额外通知', async () => {
  const port = createOfficeInteractions('docx');
  let changes = 0;
  port.subscribe(() => {
    throw new Error('observer');
  });
  port.subscribe(() => {
    changes++;
  });
  await port.execute({ type: 'outline', open: true });
  await port.execute({ type: 'outline', open: true });
  assert.equal(port.getState().showOutline, true);
  assert.equal(changes, 1);
  await port.execute({ type: 'search', open: true });
  assert.equal(port.getState().showOutline, false);
  assert.equal(port.getState().showSearch, true);
  port.dispose();
});

test('非法导航和不适用的格式命令不能改变状态', async () => {
  const port = createOfficeInteractions('pptx');
  port.updateDocument({ slideCount: 2 });
  await assert.rejects(
    port.execute({ type: 'navigate', target: { kind: 'slide', index: 2 } }),
    { code: 'INVALID_TARGET' },
  );
  await assert.rejects(port.execute({ type: 'revision', mode: 'markup' }), {
    code: 'UNSUPPORTED_COMMAND',
  });
  assert.equal(port.getState().activeIndex, 0);
  await port.execute({ type: 'navigate', target: { kind: 'slide', index: 1 } });
  assert.equal(port.getState().activeIndex, 1);
});

test('尚未绑定的搜索明确失败，旧绑定清理不影响新绑定', async () => {
  const port = createOfficeInteractions('xlsx');
  await assert.rejects(port.execute({ type: 'search', query: 'hello' }), {
    code: 'COMMAND_NOT_READY',
  });
  let query = '';
  const old = port.bind({
    setQuery: () => {
      query = 'old';
    },
  });
  port.bind({
    setQuery: (value) => {
      query = value;
    },
  });
  old();
  await port.execute({ type: 'search', query: 'hello' });
  assert.equal(query, 'hello');
  assert.equal(port.getState().showSearch, true);
  port.dispose();
  await assert.rejects(port.execute({ type: 'search', query: 'late' }), {
    code: 'OFFICE_DISPOSED',
  });
});

test('工作表使用稳定 ID，未知表和缩放非法值不能触发读取', async () => {
  const port = createOfficeInteractions('xlsx');
  port.updateDocument({
    sheets: [
      { id: 's1', name: 'One' },
      { id: 's2', name: 'Two' },
    ],
  });
  assert.equal(port.getState().activeSheetId, 's1');
  await assert.rejects(
    port.execute({
      type: 'navigate',
      target: { kind: 'sheet', sheetId: 'missing' },
    }),
    { code: 'INVALID_TARGET' },
  );
  await assert.rejects(port.execute({ type: 'zoom', value: NaN }), {
    code: 'INVALID_ZOOM',
  });
  await port.execute({
    type: 'navigate',
    target: { kind: 'sheet', sheetId: 's2' },
  });
  await port.execute({ type: 'sheetMode', mode: 'reading' });
  assert.equal(port.getState().activeSheetId, 's2');
  assert.equal(port.getState().sheetMode, 'reading');
});

test('能力按格式和就绪状态生成，不虚构页数', () => {
  const word = createOfficeInteractions('docx');
  const first = createOfficeCapabilities(word, 'zh-CN');
  assert.equal(first.navigation, undefined);
  assert.ok(first.actions.some((action) => action.id === 'office.revision'));
  const sheet = createOfficeInteractions('xlsx');
  const caps = createOfficeCapabilities(sheet, 'en-US');
  assert.equal(caps.navigation, undefined);
  assert.equal(
    caps.actions.some((action) => action.id === 'office.revision'),
    false,
  );
  assert.ok(caps.actions.some((action) => action.id === 'office.sheetMode'));
});

for (const kind of ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']) {
  test(kind + ' 工具栏按真实内容展示，隐藏动作仍可调用', async () => {
    const port = createOfficeInteractions(kind);
    port.bind({ navigatePage() {} });
    const caps = () => createOfficeCapabilities(port);
    const action = (id) => caps().actions.find((item) => item.id === id);
    assert.deepEqual(caps().zoom.presets, [50, 75, 100, 125, 150, 200]);
    assert.equal(action('office.zoomMode').toolbar.visible, false);
    if (kind.startsWith('doc')) {
      assert.equal(action('office.outline').toolbar.visible, false);
      assert.equal(action('office.revision').toolbar.visible, false);
      port.updateDocument({ outlineCount: 2, pageCount: 3 });
      assert.equal(action('office.outline').toolbar.visible, true);
      assert.equal(caps().navigation.toolbar.visible, false);
      await caps().navigation.goTo(1);
      assert.equal(port.getState().pageIndex, 1);
      port.updateAnnotations(0, {
        supportsRevisionModes: true,
        revisionCount: 2,
      });
      assert.equal(action('office.revision').toolbar.visible, true);
      port.updateAnnotations(1);
      assert.equal(action('office.revision').toolbar.visible, true);
      port.updateAnnotations(0);
      port.updateDocument({ outlineCount: 0 });
      assert.equal(action('office.revision').toolbar.visible, false);
      assert.equal(action('office.outline').toolbar.visible, false);
    } else {
      assert.equal(action('office.review').toolbar.visible, false);
      port.updateAnnotations(0, { noteCount: 1 });
      assert.equal(action('office.review').toolbar.visible, true);
      port.updateAnnotations(0);
      assert.equal(action('office.review').toolbar.visible, false);
      if (kind.startsWith('xls')) {
        port.updateDocument({ sheets: [{ id: 'one', name: 'One' }] });
        assert.equal(action('office.sheet').toolbar.visible, false);
        assert.equal(action('office.sheetMode').toolbar.showLabel, false);
        await action('office.sheet').run('one');
      } else {
        port.updateDocument({ slideCount: 2 });
        assert.equal(action('office.transitions').toolbar.visible, false);
        await action('office.transitions').run();
        assert.equal(port.getState().transitions, true);
        assert.equal(caps().navigation.toolbar.layout, 'buttons');
        assert.ok(
          caps().navigation.toolbar.order <
            action('office.notes').toolbar.order,
        );
      }
    }
    await caps().zoom.mode.set('fit-width');
    await caps().zoom.set(caps().zoom.value);
    assert.equal(port.getState().zoomMode, 'percentage');
    port.dispose();
  });
}

test('大纲和审阅统计只在变化时通知，旧单参数调用清空附加信息', () => {
  const port = createOfficeInteractions('docx');
  let count = 0;
  port.subscribe(() => count++);
  port.updateDocument({ outlineCount: 3 });
  port.updateDocument({ outlineCount: 3 });
  port.updateAnnotations(1, {
    noteCount: 2,
    revisionCount: 4,
    supportsRevisionModes: true,
  });
  port.updateAnnotations(1, {
    noteCount: 2,
    revisionCount: 4,
    supportsRevisionModes: true,
  });
  assert.equal(count, 2);
  port.updateAnnotations(1);
  assert.equal(port.getState().noteCount, 0);
  assert.equal(port.getState().revisionCount, 0);
  assert.equal(port.getState().supportsRevisionModes, false);
});

test('原始导出不修改缓存字节，忽略取消的自定义读取器也不会交付结果', async () => {
  const data = new Uint8Array([1, 2, 3]);
  const source = {
    name: 'original.docx',
    mimeType: 'example',
    readAll: async () => data,
    dispose: async () => {},
  };
  const output = await exportOriginal(source, new AbortController().signal);
  output.bytes[0] = 9;
  assert.equal(data[0], 1);
  assert.equal(output.name, 'original.docx');
  const abort = new AbortController();
  const lateSource = {
    ...source,
    readAll: async () => {
      abort.abort();
      return data;
    },
  };
  await assert.rejects(exportOriginal(lateSource, abort.signal), {
    name: 'AbortError',
  });
});

test('自适应缩放保持模式，手动缩放退出模式并忽略过期测量', async () => {
  const port = createOfficeInteractions('docx');
  port.bind({});
  await port.execute({ type: 'zoomMode', mode: 'fit-width' });
  port.updateFitZoom('fit-width', 85);
  assert.equal(port.getState().zoomMode, 'fit-width');
  assert.equal(port.getState().zoom, 85);
  await port.execute({ type: 'zoomMode', mode: 'fit-page' });
  port.updateFitZoom('fit-width', 70);
  assert.equal(port.getState().zoom, 85);
  port.updateFitZoom('fit-page', 65);
  assert.equal(port.getState().zoom, 65);
  await port.execute({ type: 'zoom', value: 100 });
  assert.equal(port.getState().zoomMode, 'percentage');
  port.updateFitZoom('fit-page', 50);
  assert.equal(port.getState().zoom, 100);
  await port.execute({ type: 'zoomMode', mode: 'fit-width' });
  port.setActive(false);
  port.updateFitZoom('fit-width', 75);
  assert.equal(port.getState().zoom, 100);
  port.setActive(true);
  port.updateFitZoom('fit-width', NaN);
  assert.equal(port.getState().zoom, 100);
  port.dispose();
  port.updateFitZoom('fit-width', 80);
  assert.equal(port.getState().zoom, 100);
});

test('缩放模式按格式提供，非法模式不修改状态', async () => {
  for (const kind of ['docx', 'pptx', 'xlsx']) {
    const port = createOfficeInteractions(kind);
    port.bind({});
    const action = createOfficeCapabilities(port).actions.find(
      (item) => item.id === 'office.zoomMode',
    );
    assert.ok(action);
    assert.equal(
      action.options.some((item) => item.value === 'fit-page'),
      kind !== 'xlsx',
    );
    await action.run('fit-width');
    assert.equal(port.getState().zoomMode, 'fit-width');
    await assert.rejects(port.execute({ type: 'zoomMode', mode: 'invalid' }), {
      code: 'INVALID_ZOOM_MODE',
    });
    assert.equal(port.getState().zoomMode, 'fit-width');
    if (kind === 'xlsx') {
      await assert.rejects(
        port.execute({ type: 'zoomMode', mode: 'fit-page' }),
        { code: 'UNSUPPORTED_COMMAND' },
      );
    }
  }
});

// 使用同一组 Office 提示组件验证输出，不启动额外浏览器测试平台。
async function loadNotices() {
  const result = await build({
    stdin: {
      contents:
        'export {mergeOfficeWarnings, collectViewWarnings} from "./packages/office/src/services/OfficeWarnings.ts";',
      resolveDir: path.resolve('.'),
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    logLevel: 'silent',
  });
  const { createRequire } = await import('node:module');
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
  );
  return module.exports;
}

test('警告按来源与字体去重，普通文件不产生宏提示', async () => {
  const { mergeOfficeWarnings, collectViewWarnings } = await loadNotices();
  const warning = {
    code: 'FONT_FALLBACK_APPLIED',
    source: 'font',
    previewKind: 'docx',
    message: '字体回退',
    requestedFamily: 'A',
    candidates: ['A'],
  };
  const first = mergeOfficeWarnings([], [warning]);
  assert.equal(mergeOfficeWarnings(first, [warning]), first);
  assert.equal(
    mergeOfficeWarnings(first, [{ ...warning, requestedFamily: 'B' }]).length,
    2,
  );
  const preview = {
    previewKind: 'docx',
    mode: 'materialized',
    model: {
      kind: 'docx',
      document: {
        review: { warnings: [{ code: 'PARSE_WARN', message: '内容降级' }] },
      },
    },
  };
  const ordinary = collectViewWarnings(preview, 'test.docx', first);
  assert.equal(ordinary.length, 2);
  assert.equal(
    ordinary.some((item) => item.code === 'MACRO_CONTENT_IGNORED'),
    false,
  );
  assert.equal(
    collectViewWarnings(preview, 'test.docm', first).some(
      (item) => item.code === 'MACRO_CONTENT_IGNORED',
    ),
    true,
  );
});

// 提示 DOM、转义和部分预览断言由浏览器 services 测试直接覆盖原生实现。
