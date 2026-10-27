import type { TextEncoding } from '@filumo/core/text';
import type { CapabilityAction, ViewContext, ViewHandle } from '@filumo/dom';
import { createReadingFrame } from '@filumo/dom';
import type { TextDecoration, TextSurfaceHandle } from '@filumo/dom/text';
import { formatEncodingWarning } from '@filumo/dom/text-messages';
import { STYLE_SCOPE } from '../generated/package';
import type { CodeSession } from '../runtime/CodeSession';
import './code.less';
import './frame.less';
import { codeLanguageOptions } from './languageMenu';

/** 可读原文先显示，高亮延后且只刷新可见行的装饰。 */
export async function mountCode(context: ViewContext): Promise<ViewHandle> {
  const session = context.session.data as CodeSession,
    content = session.content,
    frame = createReadingFrame(context, STYLE_SCOPE!, 'code');
  const sourceHost = frame.body.ownerDocument.createElement('div');
  sourceHost.className = 'filumo-code-source-host';
  const readingHost = frame.body.ownerDocument.createElement('div');
  readingHost.className = 'filumo-code-source-host';
  readingHost.hidden = true;
  frame.body.append(sourceHost, readingHost);
  let mode: 'source' | 'reading' =
    session.htmlDocument && session.options.html?.initialMode === 'reading'
      ? 'reading'
      : 'source';
  let reading: import('./html/HtmlReading').HtmlReading | undefined;
  let readingRevision = -1;
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
    const actions: CapabilityAction[] = [
      ...(session.htmlDocument
        ? [
            {
              id: 'code.view',
              label:
                mode === 'source'
                  ? en
                    ? 'Reading'
                    : '阅读'
                  : en
                  ? 'Source'
                  : '源码',
              kind: 'action' as const,
              toolbar: { placement: 'main' as const, order: 0, priority: 120 },
              run: () => {
                mode = mode === 'source' ? 'reading' : 'source';
                run();
              },
            },
          ]
        : []),
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
        enabled: mode === 'reading' ? !!reading : !!surface,
        // 查找默认直达，窄容器中比缩放更晚收纳。
        toolbar: { placement: 'main', order: 1, priority: 110 },
        run: () => {
          if (mode === 'reading') reading?.search.show(true);
          else surface?.showSearch(true);
        },
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
    ];
    frame.publish(
      actions.filter(
        (action) =>
          mode === 'source' ||
          !['code.language', 'code.wrap', 'code.lines', 'code.copy'].includes(
            action.id,
          ),
      ),
      {
        value: zoom,
        min: 50,
        max: 300,
        step: 10,
        set: async (value) => {
          zoom = value;
          refresh();
          if (reading && content.document)
            reading.update(content.document.text, content.revision, zoom);
          publish();
        },
      },
      mode === 'reading' ? reading?.search.capabilities() : undefined,
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
    sourceHost.hidden = mode !== 'source';
    readingHost.hidden = mode !== 'reading';
    surface?.setActive(active && mode === 'source');
    session.setActive(active && mode === 'source');
    reading?.setActive(active && mode === 'reading');
    if (mode === 'reading') {
      try {
        if (!reading || readingRevision !== content.revision) {
          const module = await import('./html/HtmlReading');
          if (closed || !active || version !== generation) return;
          reading?.dispose();
          reading = new module.HtmlReading(
            readingHost,
            session.resources,
            publish,
            options.locale === 'en-US',
          );
          readingRevision = content.revision;
        }
        reading.update(document.text, content.revision, zoom);
        publish();
        return;
      } catch (reason) {
        reading?.dispose();
        reading = undefined;
        readingRevision = -1;
        mode = 'source';
        error(reason);
        await render();
        return;
      }
    }
    const key = content.revision + ':' + session.language;
    if (enhancedKey !== key) ranges = [];
    if (!surface) {
      const module = await import('@filumo/dom/text');
      if (closed || !active || version !== generation) return;
      surface = module.mountTextSurface(sourceHost, document, surfaceOptions());
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
  function run() {
    if (!closed && active) void render().catch(error);
  }
  const stop = content.subscribe(run);
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
      reading?.setLocale(next.locale === 'en-US');
      if (next.zoom !== options.zoom && next.zoom !== undefined)
        zoom = next.zoom;
      options = next;
      run();
    },
    setActive(value) {
      active = value;
      session.setActive(value);
      surface?.setActive(value && mode === 'source');
      reading?.setActive(value && mode === 'reading');
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
      reading?.dispose();
      frame.dispose();
    },
  };
}
