import { createSession } from '@fivo/core';
import { createViewer, useStyles } from '@fivo/dom';
import { office } from '@fivo/office';
const button = document.getElementById('run')!;
button.onclick = async () => {
  const lines: string[] = [];
  const out = document.getElementById('result')!;
  const check = (ok: boolean, label: string) => {
    if (!ok) throw new Error(label);
    lines.push('通过：' + label);
    out.textContent = lines.join('\n');
  };
  try {
    const count = () =>
      document.querySelectorAll('style[data-fivo-style]').length;
    let blocked = false;
    try {
      useStyles('dom', document);
    } catch {
      blocked = true;
    }
    check(blocked && count() === 0, 'CSP 拒绝无 nonce 样式并清理');
    const first = useStyles('dom', document, { nonce: 'fivo-test' });
    const before = count();
    const second = useStyles('dom', document, { nonce: 'fivo-test' });
    check(before > 0 && count() === before, '同文档样式引用共享');
    first();
    check(count() === before, '释放一个实例不影响另一个');
    second();
    check(count() === 0, '最后租约清理');
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const frameDoc = iframe.contentDocument!;
    const release = useStyles('dom', frameDoc, { nonce: 'fivo-test' });
    check(
      frameDoc.querySelectorAll('style[data-fivo-style]').length > 0 &&
        count() === 0,
      '跨 Document 独立注册',
    );
    release();
    iframe.remove();
    let missing = false;
    try {
      useStyles('office', document, { mode: 'external' });
    } catch {
      missing = true;
    }
    check(missing, '外部 CSS 缺失明确失败');
    for (const name of ['dom', 'office', 'image'])
      await new Promise<void>((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = './external-' + name + '.css';
        link.onload = () => resolve();
        link.onerror = () => reject(new Error('外部 CSS 加载失败'));
        document.head.append(link);
      });
    const container = document.createElement('div');
    document.body.append(container);
    const viewer = createViewer(container, {
      plugins: [office({ worker: 'always' })],
      height: 500,
      stylePolicy: { mode: 'external' },
    });
    await viewer.open(new URL('./fixtures/sample.docx', location.href).href);
    check(
      count() === 0 && container.querySelector('.office-file-viewer') !== null,
      'external 样式下真实 Office 就绪且不注入 style',
    );
    await viewer.destroy();
    container.remove();
    let report: any;
    let disposed = 0;
    const plugin = {
      document: {
        id: 'plain',
        protocolVersion: 1 as const,
        extensions: ['.plain'],
        mimeTypes: [],
        detect: async () => true,
        load: async () => ({
          open: async (source: any, ctx: any) => {
            report = ctx.reportProgress;
            return createSession({ ...ctx, source, format: 'plain', data: {} });
          },
        }),
      },
      loadView: async () => ({
        mount: async (ctx: any) => {
          ctx.container.textContent = '非分页文档';
          return {
            update() {},
            setActive() {},
            async dispose() {
              disposed++;
            },
          };
        },
      }),
    };
    const plainHost = document.createElement('div');
    document.body.append(plainHost);
    const plain = createViewer(plainHost, {
      plugins: [plugin],
      stylePolicy: { nonce: 'fivo-test' },
    });
    await plain.open(new File(['hello'], 'a.plain'));
    report({ phase: 'content', loaded: 2, total: 4 });
    check(
      plainHost.querySelector('progress')!.value === 50 &&
        !plainHost.querySelector<HTMLElement>('.fivo-progress')!.hidden,
      '渐进就绪后持续显示真实进度',
    );
    report(undefined);
    check(
      plainHost.querySelector<HTMLElement>('.fivo-progress')!.hidden,
      '完成后清理进度',
    );
    await plain.destroy();
    check(disposed === 1, '非 Office 视图唯一释放');
    plainHost.remove();
    document.body.dataset.verification = 'passed';
    out.textContent = lines.join('\n') + '\n全部通过';
  } catch (error) {
    document.body.dataset.verification = 'failed';
    out.textContent = lines.join('\n') + '\n失败：' + String(error);
  }
};
