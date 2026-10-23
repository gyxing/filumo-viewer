import { createReadingFrame } from '@filumo/dom';
import type { CapabilityAction, ViewContext, ViewHandle } from '@filumo/dom';
import type { TextEncoding } from '@filumo/core/text';
import { formatEncodingWarning } from '@filumo/dom/text-messages';
import type { TextSurfaceHandle } from '@filumo/dom/text';
import type { CsvSession } from '../runtime/CsvSession';
import type { CsvDelimiter, CsvIndex, CsvParseResult } from '../parser/types';
import type { CsvGrid } from './CsvGrid';
import { STYLE_SCOPE } from '../generated/package';
import './frame.less';

/** 格式外壳连接会话和两种独立视图，不在原文模式预建表格索引。 */
export async function mountCsv(context: ViewContext): Promise<ViewHandle> {
  const session = context.session.data as CsvSession,
    content = session.content,
    frame = createReadingFrame(context, STYLE_SCOPE!, 'csv');
  const sourceHost = context.container.ownerDocument.createElement('div');
  sourceHost.className = 'filumo-csv-source';
  sourceHost.hidden = true;
  frame.body.append(sourceHost);
  let options = context.options,
    zoom = options.zoom ?? 100,
    source: TextSurfaceHandle | undefined,
    grid: CsvGrid | undefined,
    index: CsvIndex | undefined,
    viewRevision = content.revision,
    active = true,
    closed = false,
    generation = 0,
    noticeId = 0;
  let warnedEncoding = 0;
  const error = (error: unknown) => {
    if (!closed && (error as { name?: string })?.name !== 'AbortError')
      frame.notice(
        --noticeId,
        error instanceof Error ? error.message : String(error),
        options.locale,
      );
  };
  const sourceOptions = () => ({
    ...options,
    zoom,
    wrap: true,
    lineNumbers: false,
    watermark: undefined,
    maxMatches: 10000,
    stylePolicy: context.stylePolicy,
  });
  const encoding = (): CapabilityAction => ({
    id: 'csv.encoding',
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
          id: 'csv.mode',
          label: en ? 'View' : '视图',
          kind: 'select',
          toolbar: { placement: 'more', order: 20 },
          value: session.mode,
          options: [
            { value: 'table', label: en ? 'Table' : '表格' },
            { value: 'source', label: en ? 'Source' : '原文' },
          ],
          run: async (value) => {
            session.mode = value === 'source' ? 'source' : 'table';
            await render();
          },
        },
        {
          id: 'csv.delimiter',
          label: en ? 'Delimiter' : '分隔符',
          kind: 'select',
          toolbar: { placement: 'more', order: 30 },
          enabled: !!content.document && !content.loading,
          value: session.delimiter,
          options: [
            { value: 'auto', label: en ? 'Automatic' : '自动' },
            { value: ',', label: en ? 'Comma' : '逗号' },
            { value: ';', label: en ? 'Semicolon' : '分号' },
            { value: '\t', label: en ? 'Tab' : '制表符' },
            { value: '|', label: en ? 'Pipe' : '竖线' },
          ],
          run: async (value) => {
            try {
              await session.setDelimiter(value as CsvDelimiter);
              session.mode = 'table';
              await render();
            } catch (reason) {
              error(reason);
              publish();
            }
          },
        },
        {
          id: 'csv.header',
          label: en ? 'First row as header' : '首行作为表头',
          kind: 'toggle',
          toolbar: { placement: 'more', order: 40 },
          pressed: session.header,
          run: () => {
            session.header = !session.header;
            grid?.update({
              locale: options.locale,
              zoom,
              stylePolicy: context.stylePolicy,
            });
            publish();
          },
        },
        {
          id: 'csv.search',
          label: en ? 'Find' : '查找',
          kind: 'action',
          // 查找默认直达，窄容器中比缩放更晚收纳。
          toolbar: { placement: 'main', order: 1, priority: 110 },
          enabled: !!content.document,
          run: () => {
            if (session.mode === 'source') source?.showSearch(true);
            else grid?.showSearch();
          },
        },
        {
          id: 'csv.copy',
          label: en ? 'Copy selection' : '复制选区',
          kind: 'action',
          toolbar: { placement: 'more', order: 60 },
          enabled: session.mode === 'table' && !!grid,
          run: () => grid?.copy().catch(error),
        },
        {
          id: 'csv.resetColumns',
          label: en ? 'Reset column widths' : '恢复列宽',
          kind: 'action',
          toolbar: { placement: 'more', order: 70 },
          enabled: session.mode === 'table' && !!grid?.hasColumnWidths,
          run: () => grid?.resetColumnWidths(),
        },
      ],
      {
        value: zoom,
        min: 50,
        max: 300,
        step: 10,
        set: async (value) => {
          zoom = value;
          grid?.update({
            locale: options.locale,
            zoom,
            stylePolicy: context.stylePolicy,
          });
          if (content.document)
            source?.update(content.document, sourceOptions());
          publish();
        },
      },
    );
  };
  const render = async () => {
    const own = ++generation;
    frame.update(options);
    if (viewRevision !== content.revision) grid?.setActive(false);
    publish();
    if (content.warning && warnedEncoding !== content.warning.id) {
      warnedEncoding = content.warning.id;
      frame.notice(
        content.warning.id,
        formatEncodingWarning(content.warning, options.locale),
        options.locale,
      );
    }
    if (!content.document) {
      frame.state(
        content.error ??
          (content.loading
            ? options.locale === 'en-US'
              ? 'Reading text…'
              : '正在读取文本…'
            : options.locale === 'en-US'
            ? 'Select text encoding'
            : '请选择文本编码'),
        encoding(),
        !!content.error,
      );
      return;
    }
    if (session.mode === 'table') {
      if (!grid)
        frame.state(
          options.locale === 'en-US' ? 'Indexing table…' : '正在建立表格索引…',
        );
      let result: CsvParseResult;
      try {
        result = await session.ensureIndex();
      } catch (reason) {
        if ((reason as { name?: string })?.name === 'AbortError') throw reason;
        result = {
          kind: 'invalid',
          diagnostics: [
            {
              message:
                reason instanceof Error ? reason.message : String(reason),
              offset: 0,
            },
          ],
        };
      }
      if (closed || !active || own !== generation) return;
      if (result.kind !== 'ready') {
        session.mode = 'source';
        error(new Error(result.diagnostics[0]?.message ?? '表格解析失败'));
      } else {
        sourceHost.hidden = true;
        source?.setActive(false);
        if (!grid || index !== result.index) {
          const module = await import('./CsvGrid');
          if (closed || !active || own !== generation) return;
          grid?.dispose();
          index = result.index;
          grid = new module.CsvGrid(
            session,
            result.index,
            context.container.ownerDocument,
            { locale: options.locale, zoom, stylePolicy: context.stylePolicy },
            error,
            undefined,
            publish,
          );
          frame.body.append(grid.element);
        }
        grid.element.hidden = false;
        viewRevision = content.revision;
        grid.setActive(active);
        grid.update({
          locale: options.locale,
          zoom,
          stylePolicy: context.stylePolicy,
        });
        frame.state('');
        publish();
        return;
      }
    }
    session.pause();
    grid?.setActive(false);
    if (grid) grid.element.hidden = true;
    if (!source) {
      const module = await import('@filumo/dom/text');
      if (closed || !active || own !== generation) return;
      source = module.mountTextSurface(
        sourceHost,
        content.document,
        sourceOptions(),
      );
    }
    sourceHost.hidden = false;
    source.update(content.document, sourceOptions());
    viewRevision = content.revision;
    source.setActive(active);
    frame.state('');
    publish();
  };
  const run = () => {
      if (!closed && active) void render().catch(error);
    },
    stop = content.subscribe(run);
  try {
    await render();
  } catch (reason) {
    stop();
    grid?.dispose();
    source?.dispose();
    frame.dispose();
    throw reason;
  }
  return {
    update(next) {
      if (next.zoom !== options.zoom && next.zoom !== undefined)
        zoom = next.zoom;
      options = next;
      grid?.update({ locale: next.locale, zoom });
      run();
    },
    setActive(value) {
      active = value;
      if (!value) session.pause();
      frame.setActive(value);
      grid?.setActive(value && session.mode === 'table');
      source?.setActive(value && session.mode === 'source');
      if (!value) generation++;
      else run();
    },
    async dispose() {
      if (closed) return;
      closed = true;
      generation++;
      session.pause();
      stop();
      grid?.dispose();
      source?.dispose();
      frame.dispose();
    },
  };
}
