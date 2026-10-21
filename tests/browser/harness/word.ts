import { createViewer } from '../../../packages/dom/src/createViewer';
import { office } from '../../../packages/office/src/descriptor';
/** 固定长表格基线，不加载旧引擎。 */
document.getElementById('run')!.onclick = async () => {
  const out = document.getElementById('result')!,
    stage = document.getElementById('preview')!;
  const lines: string[] = [];
  const check = (ok: boolean, message: string) => {
    if (!ok) throw Error(message);
    lines.push('通过：' + message);
  };
  const viewer = createViewer(stage, {
    plugins: [office({ worker: 'never' })],
    height: 800,
    toolbar: false,
  });
  try {
    const reference = await (await fetch('/reference.json')).json();
    await viewer.open(
      new File(
        [await (await fetch('/complex.docx')).arrayBuffer()],
        'complex.docx',
      ),
    );
    const scroll = stage.querySelector<HTMLElement>(
      '.office-file-docx-viewer__scroller',
    )!;
    for (
      let i = 0;
      i < 800 && !scroll.textContent?.includes('后置段落 7');
      i++
    ) {
      scroll.scrollTop = scroll.scrollHeight;
      await new Promise((r) => setTimeout(r, 20));
    }
    check(!!scroll.textContent?.includes('后置段落 7'), '完整文档尾部');
    check(
      Number(
        stage.querySelector<HTMLElement>('[data-page-count]')?.dataset
          .pageCount,
      ) === reference.first.navigationCount,
      '固定分页数一致',
    );
    scroll.scrollTop = 0;
    for (let i = 0; i < 200 && !scroll.textContent?.includes('前置段落 0'); i++)
      await new Promise((r) => setTimeout(r, 20));
    const article = scroll.querySelector<HTMLElement>('article')!;
    check(
      article.textContent?.replace(/\s+/g, ' ').trim() === reference.first.text,
      '首页正文及注释完整',
    );
    check(
      Math.abs(article.getBoundingClientRect().width - reference.first.width) <
        0.5,
      '固定页面宽度一致',
    );
    if (reference.blocks) {
      const nodes = Array.from(article.children).filter(
        (n) =>
          n.tagName === 'P' ||
          n.classList.contains('office-file-docx-table-block'),
      ) as HTMLElement[];
      check(
        nodes.length === reference.blocks.length &&
          nodes.every(
            (n, i) =>
              Math.abs(
                n.getBoundingClientRect().height - reference.blocks[i].height,
              ) < 0.5 && Math.abs(n.offsetTop - reference.blocks[i].top) < 0.5,
          ),
        '段落脚注表格几何保持',
      );
    }
    check(
      !stage.querySelector('.office-file-docx-viewer__measure article'),
      '隐藏测量树释放',
    );
    await viewer.destroy();
    check(!stage.querySelector('.filumo-viewer'), '原生 Word 销毁');
    document.body.dataset.verification = 'passed';
    out.textContent = lines.join('\n');
  } catch (error) {
    await viewer.destroy();
    document.body.dataset.verification = 'failed';
    out.textContent = lines.join('\n') + '\n' + String(error);
  }
};
