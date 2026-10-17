import type { CapabilityAction, ViewContext, ViewHandle } from '@fivo/dom';
import { createReadingFrame } from '@fivo/dom';
import type { TextEncoding } from '@fivo/text/reader';
import type { TextSurfaceHandle } from '@fivo/text/view';
import { STYLE_SCOPE } from '../generated/package';
import type { MarkdownSession } from '../runtime/MarkdownSession';
import type { MarkdownBlocks } from './MarkdownBlocks';
import { hasHtmlTokens } from './hasHtmlTokens';
import './frame.less';
/** 模式外壳不导入 Marked，编码恢复和原文初始模式保持轻量。 */
export async function mountMarkdown(context: ViewContext): Promise<ViewHandle> {
  const session = context.session.data as MarkdownSession,
    content = session.content;
  const frame = createReadingFrame(context, STYLE_SCOPE!, 'markdown');
  frame.body.parentElement?.classList.add('fivo-markdown-frame');
  let options = context.options,
    zoom = options.zoom ?? 100,
    reading: MarkdownBlocks | undefined,
    surface: TextSurfaceHandle | undefined,
    closed = false,
    active = true,
    generation = 0;
  let savedRevision = content.revision,
    sourcePosition = { top: 0, left: 0 },
    readingPosition = { top: 0, left: 0 };
  const encoding = (): CapabilityAction => ({
    id: 'markdown.encoding',
    kind: 'select',
    toolbar: { placement: 'more', order: 10 },
    label: options.locale === 'en-US' ? 'Encoding' : '编码',
    value: content.encoding,
    options: ['auto', 'utf-8', 'utf-16le', 'utf-16be', 'gbk', 'gb18030'].map(
      (value) => ({
        value,
        label:
          value === 'auto'
            ? (options.locale === 'en-US' ? 'Auto' : '自动') +
              (content.document
                ? ' · ' + content.document.encoding.toUpperCase()
                : '')
            : value.toUpperCase(),
      }),
    ),
    run: (value) => content.setEncoding(value as TextEncoding),
  });
  const publish = () => {
    const en = options.locale === 'en-US';
    frame.publish(
      [
        encoding(),
        {
          id: 'markdown.mode',
          kind: 'select',
          toolbar: { placement: 'more', order: 20 },
          label: en ? 'View' : '视图',
          value: session.mode,
          options: [
            { value: 'reading', label: en ? 'Reading' : '阅读' },
            { value: 'source', label: en ? 'Source' : '原文' },
          ],
          run: (value) => {
            session.mode = value === 'source' ? 'source' : 'reading';
            run();
          },
        },
        {
          id: 'markdown.outline',
          kind: 'toggle',
          label: en ? 'Outline' : '大纲',
          toolbar: {
            visible: session.mode === 'reading',
            placement: 'main',
            priority: 120,
          },
          enabled: reading?.getOutlineState().available === true,
          pressed: reading?.getOutlineState().open === true,
          run: () => {
            reading?.toggleOutline();
          },
        },
        {
          id: 'markdown.search',
          kind: 'action',
          toolbar: { placement: 'more', order: 30 },
          label: en ? 'Find' : '查找',
          enabled: !!content.document,
          run: () => {
            if (reading) reading.showSearch();
            else surface?.showSearch(true);
          },
        },
      ],
      {
        value: zoom,
        min: 50,
        max: 300,
        step: 10,
        set: async (value) => {
          zoom = value;
          reading?.setZoom(value);
          if (content.document)
            surface?.update(content.document, {
              ...options,
              zoom,
              watermark: undefined,
              stylePolicy: context.stylePolicy,
            });
          publish();
        },
      },
    );
  };
  const render = async () => {
    const current = ++generation;
    if (savedRevision === content.revision) {
      if (surface) sourcePosition = surface.getPosition();
      if (reading) readingPosition = reading.getPosition();
    } else {
      savedRevision = content.revision;
      sourcePosition = { top: 0, left: 0 };
      readingPosition = { top: 0, left: 0 };
    }
    reading?.dispose();
    reading = undefined;
    surface?.dispose();
    surface = undefined;
    frame.body.replaceChildren();
    publish();
    frame.update(options);
    if (!content.document) {
      frame.state(
        content.loading
          ? options.locale === 'en-US'
            ? 'Reading…'
            : '正在读取…'
          : content.error ??
              (options.locale === 'en-US'
                ? 'Choose text encoding.'
                : '请选择文本编码。'),
        content.loading ? undefined : encoding(),
        !!content.error,
      );
      return;
    }
    frame.state('');
    if (session.mode === 'source') {
      const module = await import('@fivo/text/view');
      if (
        closed ||
        !active ||
        context.session.signal.aborted ||
        current !== generation
      )
        return;
      surface = module.mountTextSurface(frame.body, content.document!, {
        ...options,
        zoom,
        watermark: undefined,
        stylePolicy: context.stylePolicy,
      });
      surface.restorePosition(sourcePosition);
    } else {
      frame.state(
        options.locale === 'en-US'
          ? 'Preparing Markdown…'
          : '正在排版 Markdown…',
      );
      const model = await session.ensureParsed();
      if (
        closed ||
        !active ||
        context.session.signal.aborted ||
        current !== generation
      )
        return;
      if (
        !model ||
        !Array.isArray(model.tokens) ||
        !Array.isArray(model.headings)
      )
        throw new Error('Markdown 任务返回了无效结果');
      const [module, html] = await Promise.all([
        import('./MarkdownBlocks'),
        hasHtmlTokens(model.tokens) ? import('./HtmlFragment') : undefined,
      ]);
      if (
        closed ||
        !active ||
        context.session.signal.aborted ||
        current !== generation
      )
        return;
      frame.state('');
      reading = new module.MarkdownBlocks(
        model,
        session.options,
        { ...context, options },
        zoom,
        publish,
        html?.HtmlFragment,
      );
      if (
        closed || !active || context.session.signal.aborted ||
        current !== generation
      ) {
        reading.dispose();
        reading = undefined;
        return;
      }
      frame.body.append(reading.element);
      reading.restorePosition(readingPosition);
    }
    publish();
  };
  function run() {
    if (!active || closed) return;
    const current = generation + 1;
    void render().catch((error) => {
      if (!closed && current === generation && !content.taskSignal.aborted)
        frame.state(String(error), encoding(), true);
    });
  }
  const stop = content.subscribe(run);
  try {
    await render();
  } catch (error) {
    stop();
    reading?.dispose();
    surface?.dispose();
    frame.dispose();
    throw error;
  }
  return {
    update(next) {
      const localeChanged = next.locale !== options.locale;
      options = next;
      zoom = next.zoom ?? zoom;
      frame.update(options);
      if (localeChanged) run();
      else {
        reading?.setZoom(zoom);
        if (content.document)
          surface?.update(content.document, {
            ...options,
            zoom,
            watermark: undefined,
            stylePolicy: context.stylePolicy,
          });
        publish();
      }
    },
    setActive(value) {
      active = value;
      frame.element.hidden = !value;
      reading?.setActive(value);
      surface?.setActive(value);
      if (!value) generation++;
      else if (!reading && !surface) run();
    },
    async dispose() {
      closed = true;
      generation++;
      stop();
      reading?.dispose();
      surface?.dispose();
      frame.dispose();
    },
  };
}
