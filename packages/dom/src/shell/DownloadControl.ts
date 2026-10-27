import type { DocumentSession, DocumentSource } from '@filumo/core';
import { abortError, throwIfAborted } from '@filumo/core';
import type { ViewerCapabilities } from '../capabilities/types';
import {
  originalDownloadAvailability,
  prepareOriginalDownload,
} from './OriginalDownload';
import { createToolbarMenu } from './ToolbarMenu';
import { createShellIcon, labelShellButton } from './icons';

interface DownloadState {
  session?: DocumentSession;
  ready: boolean;
  active: boolean;
  locale?: string;
  capabilities: ViewerCapabilities;
  handler?: (source: DocumentSource, signal: AbortSignal) => Promise<void>;
}

/** 按钮、程序调用和子查看器复用同一下载通道，避免绕过鉴权或重复物化。 */
export function createDownloadControl(
  button: HTMLButtonElement,
  root: HTMLElement,
  getState: () => DownloadState,
  changed: () => void,
  onError: (error: unknown) => void,
) {
  const document = root.ownerDocument;
  const owner = document.createElement('span');
  owner.className = 'filumo-toolbar-download';
  button.replaceWith(owner);
  owner.append(button);
  button.classList.add('filumo-download-file');
  const menu = createToolbarMenu(button, owner, onError);
  const menuClick = button.onclick;
  const menuId = button.getAttribute('aria-controls')!;
  const chevron = createShellIcon(document, 'chevronDown');
  chevron.setAttribute('width', '12');
  chevron.setAttribute('height', '12');
  const leases = new Set<() => void>();
  let closed = false;
  let targetKey = '';
  let pending: Promise<void> | undefined;
  const availability = () => {
    const state = getState();
    return originalDownloadAvailability(
      state.ready && !!state.session && !closed && !pending,
      state.active,
      !!state.handler,
      state.capabilities.originalDownload,
    );
  };
  const perform = (targetId?: string): Promise<void> => {
    if (pending) return pending;
    const state = getState(),
      session = state.session;
    if (closed || !state.ready || !state.active || !session)
      return Promise.reject(abortError());
    const target = targetId
      ? state.capabilities.downloadTargets?.find((item) => item.id === targetId)
      : undefined;
    if (targetId && !target) return Promise.reject(abortError());
    if (target?.enabled === false)
      return Promise.reject(new Error(target.reason ?? '当前下载目标不可用'));
    pending = Promise.resolve()
      .then(async () => {
        throwIfAborted(session.signal);
        if (target?.kind === 'custom') {
          await target.run(session.signal);
          return;
        }
        const file = await prepareOriginalDownload(
          session.source,
          session.signal,
          state.handler,
          state.capabilities.originalDownload,
        );
        throwIfAborted(session.signal);
        if (closed || getState().session !== session) throw abortError();
        if (!file) return;
        const win = document.defaultView;
        if (!win) throw new Error('此文档没有下载窗口');
        const url = win.URL.createObjectURL(file.blob);
        let timer: number;
        const release = () => {
          win.clearTimeout(timer);
          win.URL.revokeObjectURL(url);
          leases.delete(release);
        };
        leases.add(release);
        timer = win.setTimeout(release, 1000);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name ?? 'document';
        link.hidden = true;
        root.append(link);
        try {
          link.click();
        } finally {
          link.remove();
        }
      })
      .finally(() => {
        pending = undefined;
        if (!closed) {
          update();
          changed();
        }
      });
    update();
    changed();
    return pending;
  };
  function update() {
    if (closed) return;
    const state = getState(),
      en = state.locale === 'en-US';
    const targets = state.capabilities.downloadTargets ?? [];
    const key = targets.map((target) => target.id).join('|');
    if (key !== targetKey) {
      if (menu.opened) menu.close(true);
      targetKey = key;
    }
    const base = availability();
    const available = state.ready && state.active && !pending;
    labelShellButton(
      button,
      targets.length
        ? en
          ? 'Download'
          : '下载'
        : en
        ? 'Download original'
        : '下载原文件',
      'download',
      true,
    );
    button.classList.toggle('is-menu', !!targets.length);
    menu.update(
      targets.map((target) => ({
        id: target.id,
        label: target.label,
        icon: target.kind === 'original' ? 'open' : 'document',
        disabled:
          !available ||
          target.enabled === false ||
          (target.kind === 'original' && !base.enabled),
        run: () => perform(target.id),
      })),
      en ? 'Download options' : '下载选项',
    );
    if (targets.length) {
      button.append(chevron);
      button.setAttribute('aria-haspopup', 'menu');
      button.setAttribute('aria-controls', menuId);
      button.setAttribute('aria-expanded', String(menu.opened));
      button.onclick = menuClick;
      button.disabled =
        !available ||
        !targets.some(
          (target) =>
            target.enabled !== false &&
            (target.kind !== 'original' || base.enabled),
        );
    } else {
      chevron.remove();
      button.removeAttribute('aria-haspopup');
      button.removeAttribute('aria-controls');
      button.removeAttribute('aria-expanded');
      button.onclick = () => {
        void perform().catch(onError);
      };
      button.disabled = !base.enabled;
      if (!base.enabled && base.reason) button.title = base.reason;
    }
  }
  return {
    update,
    capability: (): NonNullable<ViewerCapabilities['download']> => ({
      ...availability(),
      run: () => perform(),
    }),
    dispose() {
      closed = true;
      for (const release of leases) release();
      leases.clear();
      menu.dispose();
    },
  };
}
