import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { DocumentationSearchDialogProps } from './DocumentationSearchDialog';
import './documentation-search.less';
import type { WebsiteLocale } from './home-content';

/** 只在用户打开搜索时加载界面与索引，快捷键不干扰输入框内的普通斜杠。 */
export function DocumentationSearch({
  locale,
  pageKey,
}: {
  locale: WebsiteLocale;
  pageKey: string;
}) {
  const [Dialog, setDialog] =
    useState<React.ComponentType<DocumentationSearchDialogProps>>();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const mounted = useRef(true);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setOpen(false);
  }, [pageKey, locale]);
  const show = useCallback(async () => {
    setOpen(true);
    if (Dialog || loading) return;
    setLoading(true);
    setError(false);
    try {
      const module = await import('./DocumentationSearchDialog');
      if (mounted.current) setDialog(() => module.DocumentationSearchDialog);
    } catch {
      if (mounted.current) {
        setError(true);
        setOpen(false);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [Dialog, loading]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const editing = target.closest?.(
        'input,textarea,[contenteditable="true"]',
      );
      if (
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') ||
        (event.key === '/' && !editing)
      ) {
        event.preventDefault();
        void show();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [show]);
  return (
    <>
      <button
        ref={button}
        className="filumo-doc-search-trigger"
        type="button"
        aria-label={locale === 'zh-CN' ? '搜索文档' : 'Search documentation'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => void show()}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.5 15.5 5.5 5.5" />
        </svg>
        <span>{locale === 'zh-CN' ? '搜索' : 'Search'}</span>
      </button>
      {loading && (
        <span className="filumo-doc-search-status" role="status">
          {locale === 'zh-CN' ? '正在加载搜索…' : 'Loading search…'}
        </span>
      )}
      {error && (
        <span className="filumo-doc-search-error" role="alert">
          {locale === 'zh-CN'
            ? '搜索加载失败，请再次点击重试'
            : 'Search failed to load. Select Search to retry.'}
        </span>
      )}
      {Dialog && open && (
        <Dialog
          locale={locale}
          onClose={() => {
            setOpen(false);
            button.current?.focus();
          }}
        />
      )}
    </>
  );
}
