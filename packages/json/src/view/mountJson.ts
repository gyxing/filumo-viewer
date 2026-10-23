import type { CapabilityAction, ViewContext, ViewHandle } from '@filumo/dom';
import { createReadingFrame } from '@filumo/dom';
import type { TextEncoding } from '@filumo/core/text';
import { formatEncodingWarning } from '@filumo/dom/text-messages';
import { STYLE_SCOPE } from '../generated/package';
import type { JsonSession } from '../runtime/JsonSession';
import type { JsonWorkspace } from './JsonWorkspace';
import type { JsonLinesSession } from '../runtime/JsonLinesSession';
type JsonReadingWorkspace = Pick<
  JsonWorkspace,
  | 'initialize'
  | 'update'
  | 'dispose'
  | 'getState'
  | 'getBranchState'
  | 'getPath'
  | 'toggleBranch'
  | 'showSearch'
  | 'setMode'
  | 'setActive'
>;
import './frame.less';

/** 外壳只管理编码恢复与工具栏，工作区再按可见区域加载代码和结构视图。 */
export async function mountJson(context: ViewContext): Promise<ViewHandle> {
  const session = context.session.data as JsonSession,
    content = session.content;
  const frame = createReadingFrame(context, STYLE_SCOPE!, 'json');
  let options = context.options,
    zoom = options.zoom ?? 100,
    workspace: JsonReadingWorkspace | undefined,
    closed = false,
    active = true,
    generation = 0,
    revision = content.revision,
    renderedRevision = -1;
  let recordNotice = 0;
  const encoding = (): CapabilityAction => ({
    id: 'json.encoding',
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
              label:
                session.variant === 'lines'
                  ? en
                    ? 'Records'
                    : '记录'
                  : state?.narrow
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
          // 查找默认直达，窄容器中比缩放更晚收纳。
          toolbar: { placement: 'main', order: 1, priority: 110 },
          label: en ? 'Find' : '查找',
          enabled: !!(state?.treeReady || state?.sourceReady),
          run: () => workspace?.showSearch(),
        },
        {
          id: 'json.lines',
          kind: 'toggle',
          toolbar: { placement: 'more', order: 35 },
          label: en ? 'Line numbers' : '行号',
          enabled: !!content.document,
          pressed: session.lineNumbers,
          run: () => {
            session.lineNumbers = !session.lineNumbers;
            workspace?.update(options, zoom);
            publish();
          },
        },
        {
          id: 'json.branch',
          menu: { kind: 'action' },
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
    renderedRevision = content.document ? content.revision : -1;
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
    const module =
      session.variant === 'lines'
        ? await import('./JsonLinesWorkspace')
        : await import('./JsonWorkspace');
    if (
      closed ||
      !active ||
      context.session.signal.aborted ||
      current !== generation
    )
      return;
    workspace =
      'JsonLinesWorkspace' in module
        ? new module.JsonLinesWorkspace(
            frame.body,
            session as JsonLinesSession,
            {
              ...context,
              options: { ...options, zoom },
              onError: (reason) => {
                if (
                  !closed &&
                  (reason as { name?: string })?.name !== 'AbortError'
                )
                  frame.notice(
                    --recordNotice,
                    reason instanceof Error ? reason.message : String(reason),
                    options.locale,
                  );
              },
            },
            publish,
          )
        : new module.JsonWorkspace(
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
  const updateContent = () => {
    if (closed) return;
    updateNotice();
    publish();
    // 只有成功提交的新内容才重建工作区，失败时保留结构树与双栏比例。
    if (!content.document || content.revision !== renderedRevision) run();
  };
  const stop = content.subscribe(updateContent);
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
      updateNotice();
      zoom = next.zoom ?? zoom;
      frame.update(options);
      workspace?.update(options, zoom);
      publish();
    },
    setActive(value) {
      active = value;
      frame.setActive(value);
      if (!value) {
        workspace?.setActive(false);
        generation++;
      } else {
        updateNotice();
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
