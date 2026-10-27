import type { ViewContext, ViewHandle } from '@filumo/dom';
import { createReadingFrame } from '@filumo/dom';
import { SplitHandle } from '@filumo/dom/split';
import { STYLE_SCOPE } from '../generated/package';
import type { ArchiveEntry } from '../reader/contracts';
import { archiveFormatForName } from '../reader/detectArchive';
import type { ArchiveSession } from '../runtime/ArchiveSession';
import { archiveDownload } from './ArchiveDownload';
import { ArchiveList } from './ArchiveList';
import { ArchiveSidebarHeader } from './ArchiveSidebarHeader';
import { ArchiveTree } from './ArchiveTree';
import { EntryPreview } from './EntryPreview';
import './archive.less';

/** 目录、列表与子预览分别持有状态，解压进度浮动显示不挤动内容。 */
export async function mountArchive(context: ViewContext): Promise<ViewHandle> {
  const session = context.session.data as ArchiveSession,
    frame = createReadingFrame(context, STYLE_SCOPE!, 'archive'),
    d = context.container.ownerDocument;
  const originalDownload = await archiveDownload(
    context,
    session.budget.limits.maxFullReadBytes,
  );
  let options = context.options,
    en = options.locale === 'en-US',
    closed = false,
    active = true,
    showTree = true,
    query = '',
    sort: 'name' | 'size' = 'name',
    selected: ArchiveEntry | undefined,
    task: AbortController | undefined,
    sequence = 0,
    navigation = 0,
    viewing = false;
  frame.body.classList.add('filumo-archive-body');
  const panes = d.createElement('div');
  panes.className = 'filumo-archive-panes';
  const left = d.createElement('aside');
  left.className = 'filumo-archive-sidebar';
  const right = d.createElement('section');
  right.className = 'filumo-archive-content';
  const breadcrumb = d.createElement('nav');
  breadcrumb.className = 'filumo-archive-breadcrumb';
  breadcrumb.setAttribute('aria-label', en ? 'Archive path' : '归档路径');
  const tools = d.createElement('div');
  tools.className = 'filumo-archive-list-tools';
  const sorting = d.createElement('button');
  sorting.type = 'button';
  sorting.textContent = en ? 'Sort by name' : '按名称排序';
  tools.append(sorting);
  const previewHost = d.createElement('div');
  previewHost.className = 'filumo-archive-preview';
  previewHost.hidden = true;
  const busy = d.createElement('div');
  busy.className = 'filumo-archive-busy';
  busy.setAttribute('role', 'status');
  busy.hidden = true;
  const preview = new EntryPreview(context, session, previewHost, () =>
    update(),
  );
  const tree = new ArchiveTree(context, (node) => {
    if (node.entry) void choose(node.entry);
    else void directory(node.path);
  });
  const list = new ArchiveList(
    d,
    (entry) => {
      void choose(entry);
    },
    en,
  );
  const sidebarHeader = new ArchiveSidebarHeader(
    d,
    () => {
      void back().catch(error);
    },
    (value) => {
      query = value;
      session.current.query = query;
      if (!viewing) list.element.scrollTop = 0;
      tree.rebuild(session.current.entries, session.current.expanded, query);
      update();
    },
  );
  left.append(sidebarHeader.element, tree.tree.element);
  right.append(breadcrumb, tools, list.element, previewHost, busy);
  panes.append(left, right);
  frame.body.append(panes);
  if (panes.clientWidth > 0 && panes.clientWidth <= 640) showTree = false;
  const split = new SplitHandle(panes, {
    first: left,
    defaultRatio: 240 / Math.max(446, panes.clientWidth - 6),
    minFirst: 160,
    minSecond: 280,
    locale: options.locale,
    stylePolicy: context.stylePolicy,
    onResize: (first) => {
      left.style.width = first + 'px';
    },
  });
  panes.insertBefore(split.element, right);
  const resize = () => {
    const width = panes.clientWidth;
    left.hidden = !showTree;
    split.update(width, showTree, options.locale);
  };
  const Resize = d.defaultView?.ResizeObserver,
    observer = Resize ? new Resize(resize) : undefined;
  observer?.observe(panes);
  function update() {
    if (closed) return;
    const level = session.current;
    sidebarHeader.update(
      en,
      viewing || !!level.directory || session.levels.length > 1,
      query,
    );
    sorting.textContent = en
      ? sort === 'name'
        ? 'Sort by name'
        : 'Sort by size'
      : sort === 'name'
      ? '按名称排序'
      : '按大小排序';
    breadcrumb.replaceChildren();
    for (let index = 0; index < session.levels.length - 1; index++) {
      const ancestor = d.createElement('button');
      ancestor.type = 'button';
      ancestor.textContent =
        session.levels[index].source.name ?? (en ? 'Archive' : '压缩包');
      const target = index;
      ancestor.onclick = () => {
        void archiveLevel(target).catch(error);
      };
      breadcrumb.append(ancestor, d.createTextNode(' / '));
    }
    const root = d.createElement('button');
    root.type = 'button';
    root.textContent = level.source.name ?? (en ? 'Archive' : '压缩包');
    root.onclick = () => {
      void directory('');
    };
    breadcrumb.append(root);
    let path = '';
    for (const part of level.directory.split('/').filter(Boolean)) {
      path += (path ? '/' : '') + part;
      const target = path,
        button = d.createElement('button');
      button.type = 'button';
      button.textContent = part;
      button.onclick = () => {
        void directory(target);
      };
      breadcrumb.append(d.createTextNode(' / '), button);
    }
    if (selected && viewing)
      breadcrumb.append(
        d.createTextNode(
          ' / ' + (selected.path.split('/').pop() ?? selected.path),
        ),
      );
    list.element.hidden = viewing;
    tools.hidden = viewing;
    previewHost.hidden = !viewing;
    if (!viewing)
      list.update(level.entries, level.directory, query, sort, selected?.id);
    tree.publish(selected ? 'file:' + selected.id : 'dir:' + level.directory);
    // 主体下载保留原始 Blob；私有 URL 不能绕过鉴权退成裸链接，也不能整包拼进 JS。
    context.setCapabilities({
      ...preview.capabilities,
      actions: [
        {
          id: 'archive.outline',
          label: en ? 'Directory' : '目录',
          kind: 'toggle',
          pressed: showTree,
          toolbar: { placement: 'main', order: 0, priority: 120 },
          run: () => {
            showTree = !showTree;
            resize();
            update();
          },
        },
        ...(viewing ? preview.capabilities.actions ?? [] : []),
      ],
      originalDownload: originalDownload.capability,
      downloadTargets: viewing
        ? [
            {
              id:
                'archive.download.entry:' + level.info.id + ':' + selected?.id,
              label: en ? 'Download current file' : '下载当前文件',
              kind: 'custom',
              enabled: preview.capabilities.download?.enabled ?? false,
              run: async () => {
                const command = preview.capabilities.download;
                if (!command) throw new Error('当前文件尚未就绪');
                await command.run();
              },
            },
            {
              id: 'archive.download.original',
              label: en ? 'Download original archive' : '下载原压缩包',
              kind: 'original',
            },
          ]
        : undefined,
    });
  }
  const rebuild = () => {
    tree.rebuild(session.current.entries, session.current.expanded, query);
    update();
  };
  function error(reason: unknown) {
    if (!closed && (reason as Error)?.name !== 'AbortError')
      frame.notice(
        --sequence,
        reason instanceof Error ? reason.message : String(reason),
        options.locale,
      );
  }
  const remember = () => {
    const level = session.current;
    level.positions.set(level.directory, {
      scroll: viewing
        ? level.positions.get(level.directory)?.scroll ?? 0
        : list.element.scrollTop,
      selected: selected?.id,
    });
  };
  const restore = () => {
    const level = session.current,
      state = level.positions.get(level.directory);
    selected = level.entries.find((entry) => entry.id === state?.selected);
    query = level.query;
    sort = level.sort;
    tree.rebuild(level.entries, level.expanded, query);
    update();
    list.element.scrollTop = state?.scroll ?? 0;
  };
  async function directory(path: string) {
    const version = ++navigation;
    remember();
    task?.abort();
    session.worker.cancel();
    await preview.clear();
    if (closed || version !== navigation) return;
    viewing = false;
    session.current.directory = path;
    const parts = path.split('/');
    let prefix = '';
    for (const part of parts) {
      if (!part) continue;
      prefix += (prefix ? '/' : '') + part;
      session.current.expanded.add('dir:' + prefix);
    }
    restore();
    if (panes.clientWidth <= 640) {
      showTree = false;
      resize();
      update();
    }
  }
  async function back() {
    task?.abort();
    session.worker.cancel();
    if (viewing) {
      await directory(session.current.directory);
      return;
    }
    const current = session.current;
    if (current.directory) {
      await directory(
        current.directory.slice(
          0,
          Math.max(0, current.directory.lastIndexOf('/')),
        ),
      );
      return;
    }
    if (session.levels.length > 1) {
      const version = ++navigation;
      remember();
      await session.back();
      await preview.clear();
      if (closed || version !== navigation) return;
      viewing = false;
      selected = undefined;
      rebuild();
      restore();
    }
  }
  async function archiveLevel(index: number) {
    const version = ++navigation;
    remember();
    task?.abort();
    session.worker.cancel();
    await preview.clear();
    if (closed || version !== navigation) return;
    viewing = false;
    selected = undefined;
    while (session.levels.length > index + 1) {
      await session.back();
      if (closed || version !== navigation) return;
    }
    restore();
  }
  async function choose(entry: ArchiveEntry) {
    if (entry.kind === 'directory') {
      await directory(entry.path);
      return;
    }
    task?.abort();
    session.worker.cancel();
    const abort = (task = new AbortController());
    const version = ++navigation;
    remember();
    const parent = entry.path.slice(
      0,
      Math.max(0, entry.path.lastIndexOf('/')),
    );
    const sameDirectory = session.current.directory === parent;
    session.current.directory = parent;
    selected = entry;
    if (sameDirectory) remember();
    else
      session.current.positions.set(parent, {
        scroll: session.current.positions.get(parent)?.scroll ?? 0,
        selected: entry.id,
      });
    session.current.selected = entry.id;
    busy.textContent = en ? 'Extracting file…' : '正在提取文件…';
    busy.hidden = false;
    update();
    try {
      if (archiveFormatForName(entry.path)) {
        await preview.clear();
        if (closed || abort.signal.aborted || version !== navigation) return;
        await session.enter(entry, abort.signal);
        if (closed || abort.signal.aborted || version !== navigation) return;
        viewing = false;
        selected = undefined;
        rebuild();
        restore();
      } else {
        if (panes.clientWidth <= 640) {
          showTree = false;
          resize();
        }
        viewing = true;
        update();
        await preview.open(entry, abort.signal);
      }
    } catch (reason) {
      if (task === abort) {
        viewing = false;
        update();
        error(reason);
      }
    } finally {
      if (task === abort) busy.hidden = true;
    }
  }
  sorting.onclick = () => {
    sort = sort === 'name' ? 'size' : 'name';
    session.current.sort = sort;
    sorting.textContent = en
      ? sort === 'name'
        ? 'Sort by name'
        : 'Sort by size'
      : sort === 'name'
      ? '按名称排序'
      : '按大小排序';
    update();
  };
  rebuild();
  resize();
  if (session.current.entries.length === 1 && session.current.format === 'gzip')
    void choose(session.current.entries[0]);
  return {
    update(next) {
      options = next;
      en = next.locale === 'en-US';
      sorting.textContent = en
        ? sort === 'name'
          ? 'Sort by name'
          : 'Sort by size'
        : sort === 'name'
        ? '按名称排序'
        : '按大小排序';
      breadcrumb.setAttribute('aria-label', en ? 'Archive path' : '归档路径');
      list.setLocale(en);
      frame.update(next);
      tree.tree.setLocale(next.locale);
      update();
      resize();
    },
    setActive(value) {
      active = value;
      frame.setActive(active);
      tree.tree.setActive(active);
      split.setActive(active);
      preview.setActive(active);
      if (!value) {
        task?.abort();
        session.worker.cancel();
      }
    },
    async dispose() {
      if (closed) return;
      closed = true;
      task?.abort();
      observer?.disconnect();
      session.worker.cancel();
      await preview.dispose();
      originalDownload.dispose();
      tree.dispose();
      sidebarHeader.dispose();
      split.dispose();
      list.dispose();
      frame.dispose();
    },
  };
}
