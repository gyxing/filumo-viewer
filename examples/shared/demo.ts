import type { ViewerHandle } from '@filumo/dom';
import { image } from '@filumo/image';
import { office } from '@filumo/office';
import { pdf } from '@filumo/pdf';
import { text } from '@filumo/text';
import { json } from '@filumo/json';
import { markdown } from '@filumo/markdown';
import { csv } from '@filumo/csv';
import { xml } from '@filumo/xml';
import { code } from '@filumo/code';
// 强制 Worker 使资源部署失败可见，正常宿主也可以采用默认 auto 回退策略。
export const plugins = [
  office({ worker: 'always' }),
  image(),
  text(),
  json(),
  markdown(),
  csv(),
  xml(),
  code(),
  pdf(),
];
export const options = { height: '65vh' };
let readyCount = 0;
let activate: ((active: boolean) => Promise<void>) | undefined;
/** 框架示例用真实 KeepAlive 钩子验证激活和恢复。 */
export function setActivation(callback: (active: boolean) => Promise<void>) {
  activate = callback;
}
export const events = {
  onReady() {
    readyCount++;
    document.body.dataset.state = 'ready';
    document.getElementById('status')!.textContent = '已加载';
  },
  onError(error: Error) {
    document.body.dataset.state = 'error';
    document.getElementById('status')!.textContent = error.message;
  },
};
/** 用真实公开 API 驱动示例，文件只在浏览器本地解析。 */
export function setupDemo(getViewer: () => ViewerHandle | undefined) {
  const output = document.getElementById('checks')!;
  const viewer = () => {
    const value = getViewer();
    if (!value) throw new Error('组件尚未挂载');
    return value;
  };
  const load = async (kind: string, bytes = false) => {
    const response = await fetch(
      new URL('./fixtures/sample.' + kind, location.href),
    );
    if (!response.ok) throw new Error('示例文件不可用');
    const data = await response.arrayBuffer();
    await viewer().open(
      bytes ? new Uint8Array(data) : new File([data], 'sample.' + kind),
    );
  };
  for (const kind of ['docx', 'xlsx', 'pptx', 'svg', 'pdf'])
    document.getElementById(kind)!.onclick = () => {
      void load(kind).catch(events.onError);
    };
  const input = document.getElementById('file') as HTMLInputElement;
  input.accept = plugins
    .flatMap((plugin) => [...plugin.document.extensions])
    .join(',');
  input.onchange = () => {
    if (input.files?.[0])
      void viewer().open(input.files[0]).catch(events.onError);
  };
  document.getElementById('verify')!.onclick = async () => {
    const lines: string[] = [];
    const check = (ok: boolean, label: string) => {
      if (!ok) throw new Error(label);
      lines.push('通过：' + label);
      output.textContent = lines.join('\n');
    };
    try {
      document.body.dataset.verification = 'running';
      await load('docx', true);
      check(
        Boolean(viewer().getCapabilities().search),
        '匿名字节内容识别和默认 Worker',
      );
      await viewer().getCapabilities().search!.setQuery('Filumo');
      for (
        let i = 0;
        i < 80 && (viewer().getCapabilities().search?.resultCount ?? 0) < 1;
        i++
      )
        await new Promise((r) => setTimeout(r, 50));
      check(
        (viewer().getCapabilities().search?.resultCount ?? 0) > 0,
        '文档查找',
      );
      const count = readyCount;
      viewer().update({ theme: 'dark' });
      viewer().update({ theme: 'light' });
      check(readyCount === count, '主题更新不重新打开文档');
      if (activate) {
        const before = viewer();
        await activate(false);
        await activate(true);
        check(
          viewer() === before && readyCount === count,
          'KeepAlive 恢复同一会话',
        );
      }
      await viewer()
        .getCapabilities()
        .actions!.find((a) => a.id === 'office.zoomMode')!
        .run('fit-width');
      await new Promise((r) => setTimeout(r, 200));
      check(
        viewer()
          .getCapabilities()
          .actions!.find((a) => a.id === 'office.zoomMode')!.value ===
          'fit-width',
        '自适应模式',
      );
      viewer().setActive(false);
      viewer().setActive(true);
      await load('xlsx');
      check(
        Boolean(
          viewer()
            .getCapabilities()
            .actions?.find((a) => a.id === 'office.sheet'),
        ),
        '工作表能力',
      );
      await viewer()
        .getCapabilities()
        .actions!.find((a) => a.id === 'office.sheetMode')!
        .run('reading');
      await load('pptx');
      check(viewer().getCapabilities().navigation!.count === 2, 'PPT 两页');
      await viewer().getCapabilities().navigation!.goTo(1);
      check(viewer().getCapabilities().navigation!.index === 1, 'PPT 翻页');
      await viewer()
        .getCapabilities()
        .actions!.find((a) => a.id === 'office.notes')!
        .run();
      check(
        document.querySelectorAll('.filumo-viewer').length === 1,
        '单一外壳',
      );
      await viewer().destroy();
      check(
        document.querySelectorAll('.filumo-viewer').length === 0,
        '销毁清理外壳',
      );
      check(
        document.querySelectorAll('style[data-filumo-style]').length === 0,
        '销毁释放自动样式',
      );
      document.body.dataset.verification = 'passed';
      lines.push('全部通过；刷新页面可重新预览。');
      output.textContent = lines.join('\n');
    } catch (error) {
      document.body.dataset.verification = 'failed';
      events.onError(error as Error);
      output.textContent = lines.join('\n') + '\n失败：' + String(error);
    }
  };
}
