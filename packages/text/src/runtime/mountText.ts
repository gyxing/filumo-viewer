import type { CapabilityAction, ViewContext, ViewHandle } from '@fivo/dom';
import { createReadingFrame } from '@fivo/dom';
import { STYLE_SCOPE } from '../generated/package';
import type { TextEncoding } from '../reader/types';
import { formatEncodingWarning } from '../reader/formatEncodingWarning';
import type { TextSurfaceHandle } from '../view/types';
import './frame.less';
import type { TextSessionData } from './openText';

/** 文本入口先呈现编码状态，真正可读后才加载原文阅读器。 */
export async function mountText(context: ViewContext): Promise<ViewHandle> {
  const { content, options: textOptions } = context.session
    .data as TextSessionData;
  const frame = createReadingFrame(context, STYLE_SCOPE!, 'text');
  let options = context.options,
    zoom = options.zoom ?? 100,
    wrap = textOptions.wrap !== false,
    lineNumbers = textOptions.lineNumbers === true,
    surface: TextSurfaceHandle | undefined,
    closed = false,
    active = true,
    generation = 0,
    renderedRevision = -1;
  const surfaceOptions = () => ({
    ...options,
    zoom,
    wrap,
    lineNumbers,
    watermark: undefined,
    stylePolicy: context.stylePolicy,
  });
  const encoding = (): CapabilityAction => ({
    id: 'text.encoding',
    allowReselect: true,
    label: options.locale === 'en-US' ? 'Encoding' : '编码',
    kind: 'select',
    toolbar: { placement: 'more', order: 10 },
    enabled: !content.loading,
    // 选中态反映实际解码结果，自动识别保留为列表底部的独立命令。
    value: content.document?.encoding ?? (content.encoding === 'auto' ? undefined : content.encoding),
    options: [
      ...['utf-8', 'utf-16le', 'utf-16be', 'gbk', 'gb18030'].map((value) => ({
        value, label: value.toUpperCase(),
      })),
      { value: 'auto', kind: 'action', dividerBefore: true, label: options.locale === 'en-US' ? 'Detect encoding again' : '重新自动识别' },
    ],
    run: (value) => {
      if (value !== 'auto' && value === content.encoding && content.document && !content.warning) return;
      return content.setEncoding(value as TextEncoding);
    },
  });
  const updateNotice = () => frame.notice(
    content.warning?.id,
    content.warning ? formatEncodingWarning(content.warning, options.locale) : undefined,
    options.locale,
  );
  const publish = () => {
    const en = options.locale === 'en-US';
    frame.publish(
      [
        encoding(),
        {
          id: 'text.wrap',
          kind: 'toggle',
          toolbar: { placement: 'more', order: 30 },
          label: en ? 'Wrap lines' : '自动换行',
          pressed: wrap,
          run: () => {
            wrap = !wrap;
            surface?.update(content.document!, surfaceOptions());
            publish();
          },
        },
        {
          id: 'text.lines',
          kind: 'toggle',
          toolbar: { placement: 'more', order: 40 },
          label: en ? 'Line numbers' : '行号',
          pressed: lineNumbers,
          run: () => {
            lineNumbers = !lineNumbers;
            surface?.update(content.document!, surfaceOptions());
            publish();
          },
        },
        {
          id: 'text.search',
          kind: 'action',
          toolbar: { placement: 'more', order: 20 },
          label: en ? 'Find' : '查找',
          enabled: !!content.document,
          run: () => surface?.showSearch(true),
        },
      ],
      {
        value: zoom,
        min: 50,
        max: 300,
        step: 10,
        set: async (value) => {
          zoom = value;
          if (content.document)
            surface?.update(content.document, surfaceOptions());
          publish();
        },
      },
    );
  };
  const render = async () => {
    renderedRevision = content.document ? content.revision : -1;
    const current = ++generation;
    publish();
    frame.update(options);
    if (!content.document) {
      surface?.dispose();
      surface = undefined;
      frame.state(
        content.loading
          ? options.locale === 'en-US'
            ? 'Reading text…'
            : '正在读取文本…'
          : content.error ??
              (options.locale === 'en-US'
                ? 'Choose the text encoding to continue.'
                : '请选择文本编码继续预览。'),
        content.loading ? undefined : encoding(),
        !!content.error,
      );
      return;
    }
    frame.state('');
    const module = await import('../view');
    if (
      closed ||
      !active ||
      context.session.signal.aborted ||
      current !== generation
    )
      return;
    if (surface) surface.update(content.document!, surfaceOptions());
    else
      surface = module.mountTextSurface(
        frame.body,
        content.document!,
        surfaceOptions(),
      );
  };
  const run = () => {
    if (!active || closed) return;
    const current = generation + 1;
    void render().catch((error) => {
      if (current === generation && !closed) context.onError(error);
    });
  };
  const updateContent = () => {
    if (closed) return;
    updateNotice();
    publish();
    // 解码尝试和失败通知只更新工具栏与提示，不触碰已显示的正文及查找状态。
    if (!content.document || content.revision !== renderedRevision) run();
  };
  const stop = content.subscribe(updateContent);
  try {
    await render();
  } catch (error) {
    stop();
    surface?.dispose();
    frame.dispose();
    throw error;
  }
  return {
    update(next) {
      options = next;
      updateNotice();
      zoom = next.zoom ?? zoom;
      run();
    },
    setActive(value) {
      active = value;
      frame.setActive(value);
      surface?.setActive(value);
      if (!value) generation++;
      else { updateNotice(); run(); }
    },
    async dispose() {
      closed = true;
      generation++;
      stop();
      surface?.dispose();
      frame.dispose();
    },
  };
}
