import type { CapabilityAction, ViewContext, ViewHandle } from '@fivo/dom';
import { createReadingFrame } from '@fivo/dom';
import type { TextEncoding } from '@fivo/text/reader';
import { STYLE_SCOPE } from '../generated/package';
import type { JsonSession } from '../runtime/JsonSession';
import type { JsonWorkspace } from './JsonWorkspace';
import './frame.less';

/** 外壳只管理编码恢复与工具栏，工作区再按可见区域加载代码和结构视图。 */
export async function mountJson(context: ViewContext): Promise<ViewHandle> {
  const session = context.session.data as JsonSession,
    content = session.content;
  const frame = createReadingFrame(context, STYLE_SCOPE!, 'json');
  let options = context.options,
    zoom = options.zoom ?? 100,
    workspace: JsonWorkspace | undefined,
    closed = false,
    active = true,
    generation = 0,
    revision = content.revision;
  const encoding = (): CapabilityAction => ({
    id: 'json.encoding',
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
    const en = options.locale === 'en-US',
      state = workspace?.getState(),
      branch = workspace?.getBranchState();
    frame.publish(
      [
        encoding(),
        {
          id: 'json.mode',
          kind: 'select',
          toolbar: { placement: 'more', order: 20 },
          label: en ? 'View' : '视图',
          value: session.mode,
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
          },
        },
        {
          id: 'json.search',
          kind: 'action',
          toolbar: { placement: 'more', order: 30 },
          label: en ? 'Find' : '查找',
          enabled: !!(state?.treeReady || state?.sourceReady),
          run: () => workspace?.showSearch(),
        },
        {
          id: 'json.branch',
          kind: 'toggle',
          toolbar: {
            visible: state?.treeReady === true,
            placement: 'more',
            order: 40,
          },
          label: branch?.expanded
            ? en
              ? 'Collapse branch'
              : '收起分支'
            : en
            ? 'Expand branch'
            : '展开分支',
          pressed: branch?.expanded === true,
          enabled: state?.treeReady === true && branch?.canToggle === true,
          run: () => workspace?.toggleBranch(),
        },
        {
          id: 'json.path',
          kind: 'action',
          toolbar: {
            visible: state?.treeReady === true,
            placement: 'more',
            order: 50,
          },
          label: en ? 'Copy path' : '复制路径',
          enabled: state?.treeReady === true,
          run: async () => {
            const clipboard =
              context.container.ownerDocument.defaultView?.navigator.clipboard;
            if (!clipboard) throw new Error('剪贴板不可用');
            await clipboard.writeText(workspace?.getPath() ?? '');
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
    const current = ++generation;
    frame.update(options);
    if (revision !== content.revision) {
      revision = content.revision;
      workspace?.dispose();
      workspace = undefined;
    }
    if (!content.document) {
      workspace?.dispose();
      workspace = undefined;
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
      publish();
      return;
    }
    frame.state('');
    publish();
    if (workspace) {
      workspace.update(options, zoom);
      return;
    }
    const module = await import('./JsonWorkspace');
    if (
      closed ||
      !active ||
      context.session.signal.aborted ||
      current !== generation
    )
      return;
    workspace = new module.JsonWorkspace(
      frame.body,
      session,
      { ...context, options: { ...options, zoom } },
      publish,
    );
    await workspace.initialize();
    if (!closed && current === generation) publish();
  };
  const run = () => {
    if (!active || closed) return;
    const current = generation + 1;
    void render().catch((error) => {
      if (!closed && current === generation && !content.taskSignal.aborted)
        frame.state(String(error), encoding(), true);
    });
  };
  const stop = content.subscribe(run);
  try {
    await render();
  } catch (error) {
    stop();
    workspace?.dispose();
    frame.dispose();
    throw error;
  }
  return {
    update(next) {
      options = next;
      zoom = next.zoom ?? zoom;
      frame.update(options);
      workspace?.update(options, zoom);
      publish();
    },
    setActive(value) {
      active = value;
      frame.element.hidden = !value;
      if (!value) {
        workspace?.setActive(false);
        generation++;
      } else {
        if (revision === content.revision && content.document)
          workspace?.setActive(true);
        run();
      }
    },
    async dispose() {
      closed = true;
      generation++;
      stop();
      workspace?.dispose();
      frame.dispose();
    },
  };
}
