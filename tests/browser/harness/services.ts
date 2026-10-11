import { createSession, normalizeSource } from '../../../packages/core/src';
import { createMemoryOfficeAnnotationSource } from '../../../packages/office/src/engine/annotations/AnnotationSource';
import { ManagedOfficeResourceStore } from '../../../packages/office/src/engine/resource-store/OfficeResourceStore';
import { mountNativeOffice } from '../../../packages/office/src/renderers/common/mountNativeOffice';
import { createOfficeInteractions } from '../../../packages/office/src/runtime/createOfficeInteractions';
import { OfficeResourceService } from '../../../packages/office/src/services/OfficeResourceService';
import { createOfficeViewServices } from '../../../packages/office/src/services/createOfficeViewServices';
import { mountChart } from '../../../packages/office/src/view/shared/mountChart';
import { mountImage } from '../../../packages/office/src/view/shared/mountImage';
import { mountImagePreview } from '../../../packages/office/src/view/shared/mountImagePreview';
import { mountWatermark } from '../../../packages/office/src/view/shared/mountWatermark';
const run = document.getElementById('run')!;
run.onclick = async () => {
  const lines: string[] = [];
  const result = document.getElementById('result')!;
  const check = (ok: boolean, label: string) => {
    if (!ok) throw new Error(label);
    lines.push('通过：' + label);
    result.textContent = lines.join('\n');
  };
  const container = document.getElementById('preview')!;
  const abort = new AbortController();
  let services: ReturnType<typeof createOfficeViewServices> | undefined;
  let resources: OfficeResourceService | undefined;
  let session: Awaited<ReturnType<typeof createSession>> | undefined;
  try {
    const file = new File([''], 'fixture.xlsx');
    const source = await normalizeSource(file);
    const interactions = createOfficeInteractions('xlsx');
    const preview = {
      sessionId: 'native-services',
      previewKind: 'xlsx',
      mode: 'materialized',
      model: { kind: 'xlsx', workbook: { warnings: [] } },
    };
    session = createSession({
      id: 'native-services',
      signal: abort.signal,
      source,
      format: 'xlsx',
      data: { file, preview, interactions },
    });
    services = createOfficeViewServices({
      container,
      session,
      options: {},
      onError: () => {},
      setCapabilities: () => {},
    });
    services.annotations.actions.registerSource(
      createMemoryOfficeAnnotationSource({
        annotations: [
          {
            id: 'note',
            text: '保留选择',
            target: {
              kind: 'spreadsheet-cell',
              sheetId: 'sheet',
              row: 1,
              column: 1,
            },
          },
        ],
      }),
    );
    await services.annotations.actions.selectId('note');
    services.setActive(false);
    services.setActive(true);
    check(
      services.annotations.getSnapshot().activeAnnotation?.id === 'note',
      '停用和恢复保留批注选择',
    );
    let loads = 0,
      created = 0,
      revoked = 0;
    resources = new OfficeResourceService(
      document,
      new ManagedOfficeResourceStore({
        objectUrls: {
          createObjectURL: (blob) => {
            created++;
            return URL.createObjectURL(blob);
          },
          revokeObjectURL: (url) => {
            revoked++;
            URL.revokeObjectURL(url);
          },
        },
      }),
    );
    const context = {
      container,
      document,
      services: { ...services, resources },
      signal: abort.signal,
      onError: (error: unknown) => {
        throw error;
      },
    };
    const bytes = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=',
      ),
      (c) => c.charCodeAt(0),
    );
    const imageSource = {
      kind: 'lazy' as const,
      id: 'pixel',
      mimeType: 'image/png',
      size: bytes.length,
      load: async () => {
        loads++;
        return new Blob([bytes], { type: 'image/png' });
      },
    };
    const a = await mountImage(
      container,
      { source: imageSource, alt: 'A' },
      context,
    );
    const b = await mountImage(
      container,
      { source: imageSource, alt: 'B' },
      context,
    );
    check(loads === 1 && created === 1, '原生图片共享读取与 URL');
    await a.dispose();
    check(
      container.querySelectorAll('img').length === 1,
      '释放首图不影响另一租约',
    );
    const trigger = document.createElement('button');
    trigger.textContent = '图片触发器';
    container.append(trigger);
    const dialog = await mountImagePreview(
      { source: imageSource, alt: '预览' },
      trigger,
      context,
    );
    check(
      container.querySelectorAll('[role=dialog]').length === 1,
      '图片预览独立租约',
    );
    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role=dialog] button'),
    );
    buttons.find((button) => button.textContent === '旋转')!.click();
    await services.layout.flush();
    check(
      container
        .querySelector<HTMLImageElement>('[role=dialog] img')!
        .style.transform.includes('rotate(90deg)'),
      '原生图片旋转',
    );
    buttons.find((button) => button.textContent === '复位')!.click();
    await services.layout.flush();
    check(
      container.querySelector('[role=dialog] output')!.textContent === '100%',
      '原生图片复位',
    );
    dialog.dispose();
    check(
      container.querySelectorAll('[role=dialog]').length === 0,
      '弹层关闭清理并恢复焦点',
    );
    await b.dispose();
    await resources.dispose();
    check(created === revoked, '图片 Object URL 成对释放');
    const watermark = mountWatermark(container, {
      content: '<script>只是文本</script>',
    });
    check(
      container.querySelectorAll('svg text').length === 1 &&
        !container.querySelector('script'),
      '原生水印按文本构造',
    );
    watermark.dispose();
    const chart = mountChart(
      container,
      {
        chart: {
          type: 'column',
          title: 'Fivo 图表',
          categories: ['A', 'B'],
          series: [{ name: '数值', values: [1, 2] }],
        },
        width: 300,
        height: 180,
      },
      context,
    );
    for (let i = 0; i < 100 && !container.querySelector('canvas'); i++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    check(!!container.querySelector('canvas'), '原生 ECharts 渲染');
    const canvas = container.querySelector('canvas');
    await chart.update({
      chart: {
        type: 'column',
        title: '更新',
        categories: ['A', 'B'],
        series: [{ name: '数值', values: [3, 4] }],
      },
      width: 320,
      height: 180,
    });
    check(container.querySelector('canvas') === canvas, '图表更新保留实例');
    chart.dispose();
    check(!container.querySelector('canvas'), '图表释放 canvas');
    const noticeFile = new File([''], 'notice.xlsx');
    const noticeSource = await normalizeSource(noticeFile);
    const noticeSession = createSession({
      source: noticeSource,
      signal: new AbortController().signal,
      format: 'xlsx',
      data: {
        file: noticeFile,
        interactions: createOfficeInteractions('xlsx'),
        preview: {
          previewKind: 'xlsx',
          sessionId: 'notice',
          mode: 'materialized',
          model: { kind: 'xlsx', workbook: { warnings: [] } },
        },
      },
    });
    let reportNotice: ((warning: any) => void) | undefined;
    const noticeView = await mountNativeOffice(
      {
        container,
        session: noticeSession,
        options: {},
        setCapabilities() {},
        onError(error) {
          throw error;
        },
      },
      async (context) => {
        reportNotice = context.services.reportWarning;
        return { update() {}, setActive() {}, async dispose() {} };
      },
    );
    check(
      container.querySelector<HTMLDetailsElement>('.fivo-office-notices')!
        .hidden,
      '无警告时提示隐藏',
    );
    reportNotice!({
      code: 'FONT_FALLBACK_APPLIED',
      source: 'font',
      previewKind: 'xlsx',
      message: '<script>bad()</script>',
      requestedFamily: 'A',
      candidates: ['A'],
    });
    check(
      container.querySelector('.fivo-office-notices li')?.textContent ===
        '<script>bad()</script>' &&
        !container.querySelector('.fivo-office-notices script'),
      '警告使用安全文本',
    );
    noticeSession.update({ status: 'error', partialReady: true });
    check(
      container.querySelector('[role=alert]')?.textContent?.includes('部分') ===
        true,
      '渐进错误显示部分预览提示',
    );
    await noticeView.dispose();
    await noticeSession.dispose();
    await services.dispose();
    await session.dispose();
    container.replaceChildren();
    document.body.dataset.verification = 'passed';
    result.textContent = lines.join('\n') + '\n全部通过';
  } catch (error) {
    result.textContent = lines.join('\n') + '\n失败：' + String(error);
    document.body.dataset.verification = 'failed';
    abort.abort();
    await resources?.dispose();
    await services?.dispose();
    await session?.dispose();
  }
};
