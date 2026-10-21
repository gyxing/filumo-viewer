import { createReadingFrame } from '@filumo/dom';
import type { CapabilityAction, ViewContext, ViewHandle } from '@filumo/dom';
import type { TextEncoding } from '@filumo/core/text';
import { formatEncodingWarning } from '@filumo/dom/text-messages';
import type { XmlSession } from '../runtime/XmlSession';
import type { XmlWorkspace } from './XmlWorkspace';
import { STYLE_SCOPE } from '../generated/package';
import './frame.less';

/** XML 外壳只发布能力，解析和原文视图由可见区域决定。 */
export async function mountXml(context: ViewContext): Promise<ViewHandle> {
  const session = context.session.data as XmlSession,
    content = session.content,
    frame = createReadingFrame(context, STYLE_SCOPE!, 'xml');
  let options = context.options,
    zoom = options.zoom ?? 100,
    workspace: XmlWorkspace | undefined,
    revision = content.revision,
    active = true,
    closed = false,
    generation = 0,
    notice = 0;
  let warnedEncoding = 0;
  const error = (reason: unknown) => {
    if (!closed && (reason as { name?: string })?.name !== 'AbortError')
      frame.notice(
        --notice,
        reason instanceof Error ? reason.message : String(reason),
        options.locale,
      );
  };
  const encoding = (): CapabilityAction => ({
    id: 'xml.encoding',
    kind: 'select',
    allowReselect: true,
    label: options.locale === 'en-US' ? 'Encoding' : '编码',
    toolbar: { placement: 'more', order: 10 },
    enabled: !content.loading,
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
    if (closed) return;
    const en = options.locale === 'en-US',
      state = workspace?.getState(),
      branch = workspace?.getBranchState();
    frame.publish(
      [
        encoding(),
        {
          id: 'xml.mode',
          label: en ? 'View' : '视图',
          kind: 'select',
          value: session.mode,
          toolbar: { placement: 'more', order: 20 },
          options: [
            {
              value: 'tree',
              label: state?.narrow
                ? en
                  ? 'Structure'
                  : '结构'
                : en
                ? 'Split view'
                : '双栏',
            },
            { value: 'source', label: en ? 'Source' : '原文' },
          ],
          run: (value) => {
            session.mode = value === 'source' ? 'source' : 'tree';
            workspace?.setMode(session.mode);
            publish();
          },
        },
        {
          id: 'xml.search',
          label: en ? 'Find' : '查找',
          kind: 'action',
          toolbar: { placement: 'more', order: 30 },
          enabled: !!content.document,
          run: () => workspace?.showSearch(),
        },
        {
          id: 'xml.lines',
          label: en ? 'Line numbers' : '行号',
          kind: 'toggle',
          toolbar: { placement: 'more', order: 35 },
          enabled: !!content.document,
          pressed: session.lineNumbers,
          run: () => {
            session.lineNumbers = !session.lineNumbers;
            workspace?.update(options, zoom);
            publish();
          },
        },
        {
          id: 'xml.branch',
          label: branch?.expanded
            ? en
              ? 'Collapse branch'
              : '收起分支'
            : en
            ? 'Expand branch'
            : '展开分支',
          kind: 'toggle',
          menu: { kind: 'action' },
          toolbar: {
            placement: 'more',
            order: 40,
            visible: state?.treeReady === true,
          },
          enabled: branch?.canToggle,
          pressed: branch?.expanded,
          run: () => workspace?.toggleBranch(),
        },
        {
          id: 'xml.whitespace',
          label: en ? 'Whitespace text nodes' : '显示空白文本节点',
          kind: 'toggle',
          toolbar: {
            placement: 'more',
            order: 50,
            visible: state?.treeReady === true,
          },
          pressed: session.whitespace,
          run: () => {
            session.whitespace = !session.whitespace;
            workspace?.update(options, zoom);
            publish();
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
          workspace?.update(options, zoom);
          publish();
        },
      },
    );
  };
  const render = async () => {
    const version = ++generation;
    frame.update(options);
    if (revision !== content.revision) {
      revision = content.revision;
      workspace?.dispose();
      workspace = undefined;
    }
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
              ? 'Reading XML…'
              : '正在读取 XML…'
            : options.locale === 'en-US'
            ? 'Select text encoding'
            : '请选择文本编码'),
        content.loading ? undefined : encoding(),
        !!content.error,
      );
      publish();
      return;
    }
    frame.state('');
    publish();
    if (workspace) {
      workspace.update(options, zoom);
      return;
    }
    const module = await import('./XmlWorkspace');
    if (closed || !active || version !== generation) return;
    workspace = new module.XmlWorkspace(
      frame.body,
      session,
      { ...context, options: { ...options, zoom }, onError: error },
      publish,
    );
    await workspace.initialize();
    if (!closed && version === generation) publish();
  };
  const run = () => {
      if (!closed && active) void render().catch(error);
    },
    stop = content.subscribe(run);
  try {
    await render();
  } catch (reason) {
    stop();
    workspace?.dispose();
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
      frame.setActive(value);
      workspace?.setActive(value);
      if (!value) generation++;
      else run();
    },
    async dispose() {
      if (closed) return;
      closed = true;
      generation++;
      stop();
      workspace?.dispose();
      frame.dispose();
    },
  };
}
