import type { CapabilityAction, ViewContext, ViewHandle } from '@filumo/dom';
import { createReadingFrame } from '@filumo/dom';
import type { TextEncoding } from '@filumo/core/text';
import { formatEncodingWarning } from '@filumo/dom/text-messages';
import type { TextSurfaceHandle } from '@filumo/dom/text';
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
  frame.body.parentElement?.classList.add('filumo-markdown-frame');
  let options = context.options,
    zoom = options.zoom ?? 100,
    reading: MarkdownBlocks | undefined,
    surface: TextSurfaceHandle | undefined,
    closed = false,
    active = true,
    dirty = false,
    generation = 0,
    renderedRevision = -1;
  let savedRevision = content.revision,
    sourcePosition = { top: 0, left: 0 },
    readingPosition = { top: 0, left: 0 };
  const encoding = (): CapabilityAction => ({
    id: 'markdown.encoding',
    allowReselect: true,
    kind: 'select',
    toolbar: { placement: 'more', order: 10 },
    label: options.locale === 'en-US' ? 'Encoding' : '编码',
    enabled: !content.loading,
    // 选中态反映实际解码结果，自动识别保留为列表底部的独立命令。
    value:
      content.document?.encoding ??
      (content.encoding === 'auto' ? undefined : content.encoding),
    options: [
      ...['utf-8', 'utf-16le', 'utf-16be', 'gbk', 'gb18030'].map((value) => ({
        value,
        label: value.toUpperCase(),
      })),
      {
        value: 'auto',
        kind: 'action',
        dividerBefore: true,
        label:
          options.locale === 'en-US' ? 'Detect encoding again' : '重新自动识别',
      },
    ],
    run: (value) => {
      if (
        value !== 'auto' &&
        value === content.encoding &&
        content.document &&
        !content.warning
      )
        return;
      return content.setEncoding(value as TextEncoding);
    },
  });
  const updateNotice = () =>
    frame.notice(
      content.warning?.id,
      content.warning
        ? formatEncodingWarning(content.warning, options.locale)
        : undefined,
      options.locale,
    );
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
    renderedRevision = content.document ? content.revision : -1;
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
      const module = await import('@filumo/dom/text');
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
        closed ||
        !active ||
        context.session.signal.aborted ||
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
    if (closed) return;
    dirty = true;
    if (!active) return;
    dirty = false;
    const current = generation + 1;
    void render().catch((error) => {
      if (!closed && current === generation && !content.taskSignal.aborted)
        frame.state(String(error), encoding(), true);
    });
  }
  const updateContent = () => {
    if (closed) return;
    updateNotice();
    publish();
    // 解码未提交时保留阅读 DOM，大纲、滚动、折叠与查找继续使用原内容。
    if (!content.document || content.revision !== renderedRevision) run();
  };
  const stop = content.subscribe(updateContent);
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
      updateNotice();
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
      frame.setActive(value);
      reading?.setActive(value);
      surface?.setActive(value);
      if (!value) generation++;
      // 停用期间的内容、模式和语言更新需要在恢复时重建，保留同一内容的滚动位置。
      else {
        updateNotice();
        if (
          dirty ||
          content.revision !== renderedRevision ||
          (!reading && !surface)
        )
          run();
      }
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
