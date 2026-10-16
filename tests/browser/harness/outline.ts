import { createSession, normalizeSource } from '../../../packages/core/src';
import { createProgressiveWordOutlineProvider } from '../../../packages/office/src/engine/word/createMemoryWordOutlineProvider';
import '../../../packages/office/src/renderers/common/native.less';
import { WordOutline } from '../../../packages/office/src/renderers/word/WordOutline';
import { createOfficeInteractions } from '../../../packages/office/src/runtime/createOfficeInteractions';
import { createOfficeViewServices } from '../../../packages/office/src/services/createOfficeViewServices';
import '../../../packages/office/src/styles/office.less';

/** 合成多级大纲覆盖跳级标题、渐进追加和虚拟滚动，不读取真实文件。 */
async function start() {
  const stage = document.getElementById('preview')!;
  stage.style.cssText =
    'display:flex;width:1000px;height:440px;position:relative';
  stage.className = 'office-file-viewer';
  const scroller = document.createElement('div');
  scroller.id = 'body-scroll';
  scroller.style.cssText = 'height:440px;overflow:auto;flex:1;min-width:0';
  const provider = createProgressiveWordOutlineProvider();
  const items = [
    { id: 'a', level: 2, text: '一、背景' },
    { id: 'b', level: 5, text: '2、分阶段建设目标' },
    {
      id: 'c',
      level: 8,
      text: '第三级长标题，完整内容保留用于悬浮提示与导航测试',
    },
    { id: 'd', level: 5, text: '3、关键绩效指标' },
    { id: 'e', level: 2, text: '二、实施方案' },
    ...Array.from({ length: 100 }, (_, i) => ({
      id: 'n' + i,
      level: 2,
      text: '章节 ' + i,
    })),
  ].map((item) => ({ ...item, targetBlockId: item.id }));
  provider.append(items);
  if (new URL(location.href).searchParams.get('complete') === '1')
    provider.complete();
  items.forEach((item) => {
    const heading = document.createElement('h2');
    heading.dataset.officeWordBlockId = item.id;
    heading.textContent = item.text;
    heading.style.cssText =
      'height:220px;margin:0;padding:12px;box-sizing:border-box';
    scroller.append(heading);
  });
  stage.append(scroller);
  const file = new File(['outline'], 'outline.doc');
  const interactions = createOfficeInteractions('doc');
  const controller = new AbortController();
  const session = createSession({
    id: 'outline-test',
    signal: controller.signal,
    source: await normalizeSource(file),
    format: 'doc',
    data: {
      file,
      interactions,
      preview: {
        previewKind: 'doc',
        mode: 'materialized',
        model: { kind: 'doc', document: { warnings: [] } },
      },
    },
  });
  const onError = (cause: unknown) => {
    document.getElementById('result')!.textContent = String(cause);
  };
  const services = createOfficeViewServices({
    container: stage,
    session,
    options: {},
    onError,
    setCapabilities() {},
  });
  const outline = new WordOutline(
    provider,
    {
      document,
      container: stage,
      services,
      signal: controller.signal,
      onError,
    },
    async (id) => {
      const target = [
        ...scroller.querySelectorAll<HTMLElement>(
          '[data-office-word-block-id]',
        ),
      ].find((node) => node.dataset.officeWordBlockId === id);
      if (!target) return false;
      scroller.scrollTop = target.offsetTop;
      document.getElementById('result')!.textContent = '定位：' + id;
      return true;
    },
    scroller,
  );
  stage.prepend(outline.element);
  outline.update(true);
  const append = document.createElement('button');
  append.textContent = '追加子级';
  append.onclick = () =>
    provider.append([
      { id: 'late', text: '渐进新增标题', level: 5, targetBlockId: 'late' },
    ]);
  const dispose = document.createElement('button');
  dispose.textContent = '销毁大纲';
  dispose.onclick = () => {
    outline.dispose();
    void services.dispose();
    void session.dispose();
  };
  document.body.prepend(append, dispose);
  document.body.dataset.ready = 'true';
}
void start();
