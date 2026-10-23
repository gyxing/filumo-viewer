import { createReadingFrame } from '@filumo/dom';
import type { CapabilityAction, ViewContext, ViewHandle } from '@filumo/dom';
import type { TextEncoding } from '@filumo/core/text';
import type { TextDecoration, TextSurfaceHandle } from '@filumo/dom/text';
import { formatEncodingWarning } from '@filumo/dom/text-messages';
import { codeLanguageOptions } from './languageMenu';
import type { CodeSession } from '../runtime/CodeSession';
import { STYLE_SCOPE } from '../generated/package';
import './code.less';
import './frame.less';

/** 可读原文先显示，高亮延后且只刷新可见行的装饰。 */
export async function mountCode(context: ViewContext): Promise<ViewHandle> {
  const session = context.session.data as CodeSession,
    content = session.content,
    frame = createReadingFrame(context, STYLE_SCOPE!, 'code');
  let options = context.options,
    zoom = options.zoom ?? 100,
    surface: TextSurfaceHandle | undefined,
    active = true,
    closed = false,
    generation = 0,
    notice = 0,
    wrap = true,
    // 独立代码文件默认展示行号，便于定位和交流；用户开关保存在当前视图中。
    lines = true;
  let ranges: readonly TextDecoration[] = [],
    enhancedKey = '',
    pendingKey = '',
    enhanceVersion = 0;
  let warnedEncoding = 0;
  const error = (reason: unknown) => {
    if (!closed && (reason as { name?: string })?.name !== 'AbortError')
      frame.notice(
        --notice,
        reason instanceof Error ? reason.message : String(reason),
        options.locale,
      );
  };
  const decorateLine = (start: number, end: number) => {
    let low = 0,
      high = ranges.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (ranges[mid].end <= start) low = mid + 1;
      else high = mid;
    }
    const visible: TextDecoration[] = [];
    for (let i = low; i < ranges.length && ranges[i].start < end; i++)
      visible.push({
        ...ranges[i],
        start: Math.max(start, ranges[i].start),
        end: Math.min(end, ranges[i].end),
      });
    return visible;
  };
  const surfaceOptions = () => ({
    locale: options.locale,
    zoom,
    wrap,
    lineNumbers: lines,
    watermark: undefined,
    stylePolicy: context.stylePolicy,
    maxMatches: 10000,
    decorateLine,
  });
  const refresh = () => {
    if (content.document) surface?.update(content.document, surfaceOptions());
  };
  const encoding = (): CapabilityAction => ({
    id: 'code.encoding',
    label: options.locale === 'en-US' ? 'Encoding' : '编码',
    kind: 'select',
    allowReselect: true,
    enabled: !content.loading,
    toolbar: { placement: 'more', order: 10 },
    value: content.document?.encoding,
    options: [
      ...['utf-8', 'utf-16le', 'utf-16be', 'gbk', 'gb18030'].map((value) => ({
        value,
        label: value.toUpperCase(),
      })),
      {
        value: 'auto',
        label:
          options.locale === 'en-US' ? 'Detect encoding again' : '重新自动识别',
        kind: 'action',
        dividerBefore: true,
      },
    ],
    run: (value) => content.setEncoding(value as TextEncoding),
  });
  const publish = () => {
    const en = options.locale === 'en-US';
    frame.publish(
      [
        encoding(),
        {
          id: 'code.language',
          label: en ? 'Language' : '语言',
          kind: 'select',
          toolbar: { placement: 'more', order: 20 },
          value: session.language,
          options: codeLanguageOptions(en),
          run: (value) => {
            session.setLanguage(String(value));
            ranges = [];
            enhancedKey = pendingKey = '';
            refresh();
            run();
          },
        },
        {
          id: 'code.search',
          label: en ? 'Find' : '查找',
          kind: 'action',
          enabled: !!surface,
          // 查找默认直达，窄容器中比缩放更晚收纳。
          toolbar: { placement: 'main', order: 1, priority: 110 },
          run: () => surface?.showSearch(true),
        },
        {
          id: 'code.wrap',
          label: en ? 'Word wrap' : '自动换行',
          kind: 'toggle',
          toolbar: { placement: 'more', order: 40 },
          pressed: wrap,
          run: () => {
            wrap = !wrap;
            refresh();
            publish();
          },
        },
        {
          id: 'code.lines',
          label: en ? 'Line numbers' : '行号',
          kind: 'toggle',
          toolbar: { placement: 'more', order: 50 },
          pressed: lines,
          run: () => {
            lines = !lines;
            refresh();
            publish();
          },
        },
        {
          id: 'code.copy',
          label: en ? 'Copy all' : '复制全文',
          kind: 'action',
          enabled: !!content.document,
          toolbar: { placement: 'more', order: 60 },
          run: async () => {
            const clipboard =
              frame.body.ownerDocument.defaultView?.navigator.clipboard;
            if (!clipboard)
              throw new Error(
                en ? 'Clipboard unavailable' : '当前环境无法访问剪贴板',
              );
            await clipboard.writeText(content.document?.text ?? '');
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
          refresh();
          publish();
        },
      },
    );
  };
  const render = async () => {
    const version = ++generation;
    frame.update(options);
    if (content.warning && warnedEncoding !== content.warning.id) {
      warnedEncoding = content.warning.id;
      frame.notice(
        content.warning.id,
        formatEncodingWarning(content.warning, options.locale),
        options.locale,
      );
    }
    const document = content.document;
    if (!document) {
      frame.state(
        content.error ??
          (options.locale === 'en-US'
            ? content.loading
              ? 'Reading code…'
              : 'Select text encoding'
            : content.loading
            ? '正在读取代码…'
            : '请选择文本编码'),
        content.loading ? undefined : encoding(),
        !!content.error,
      );
      publish();
      return;
    }
    frame.state('');
    const key = content.revision + ':' + session.language;
    if (enhancedKey !== key) ranges = [];
    if (!surface) {
      const module = await import('@filumo/dom/text');
      if (closed || !active || version !== generation) return;
      surface = module.mountTextSurface(frame.body, document, surfaceOptions());
    } else refresh();
    publish();
    if (enhancedKey === key || pendingKey === key) return;
    pendingKey = key;
    const enhancement = ++enhanceVersion;
    void session
      .ensureHighlight()
      .then((result) => {
        if (
          closed ||
          !active ||
          enhancement !== enhanceVersion ||
          key !== content.revision + ':' + session.language
        )
          return;
        enhancedKey = key;
        ranges = result.kind === 'ready' ? result.decorations : [];
        refresh();
      })
      .catch(error)
      .finally(() => {
        if (pendingKey === key && enhancement === enhanceVersion)
          pendingKey = '';
      });
  };
  const run = () => {
      if (!closed && active) void render().catch(error);
    },
    stop = content.subscribe(run);
  try {
    await render();
  } catch (reason) {
    stop();
    surface?.dispose();
    frame.dispose();
    throw reason;
  }
  return {
    update(next) {
      if (next.zoom !== options.zoom && next.zoom !== undefined)
        zoom = next.zoom;
      options = next;
      run();
    },
    setActive(value) {
      active = value;
      session.setActive(value);
      surface?.setActive(value);
      frame.setActive(value);
      if (!value) {
        generation++;
        enhanceVersion++;
        pendingKey = '';
      } else run();
    },
    async dispose() {
      if (closed) return;
      closed = true;
      generation++;
      stop();
      session.setActive(false);
      surface?.dispose();
      frame.dispose();
    },
  };
}
