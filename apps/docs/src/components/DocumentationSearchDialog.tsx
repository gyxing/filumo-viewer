import type { InputRef } from 'antd';
import { Input, Modal } from 'antd';
import { Link, useSiteSearch } from 'dumi';
import React, { useEffect, useRef, useState } from 'react';
import type { WebsiteLocale } from './home-content';

export interface DocumentationSearchDialogProps {
  locale: WebsiteLocale;
  onClose(): void;
}

/** 复用 Dumi 的本地索引，以普通链接呈现命中项，Modal 统一处理焦点和移动端遮罩。 */
export function DocumentationSearchDialog({
  locale,
  onClose,
}: DocumentationSearchDialogProps) {
  const { keywords, setKeywords, result, loading, load } = useSiteSearch();
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const input = useRef<InputRef>(null);
  const results = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    void load()
      .then(() => {
        if (active) setReady(true);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [load]);
  useEffect(() => {
    if (ready) input.current?.focus();
  }, [ready]);
  const hints = result.flatMap((group) => group.hints);
  const text = (parts: readonly { text: string; highlighted?: boolean }[]) =>
    parts.map((part, index) =>
      part.highlighted ? <mark key={index}>{part.text}</mark> : part.text,
    );
  const en = locale === 'en-US';
  const focusHint = (index: number) => {
    const container = results.current;
    const link = container?.querySelectorAll<HTMLAnchorElement>('a')[index];
    if (!container || !link) return;
    link.focus({ preventScroll: true });
    // 只滚动命中列表，不让键盘导航牵动背后的正文或目录。
    const item = link.getBoundingClientRect(),
      area = container.getBoundingClientRect();
    if (item.top < area.top) container.scrollTop += item.top - area.top;
    else if (item.bottom > area.bottom)
      container.scrollTop += item.bottom - area.bottom;
  };
  return (
    <Modal
      open
      title={en ? 'Search documentation' : '搜索文档'}
      footer={null}
      onCancel={onClose}
      afterOpenChange={(visible) => {
        if (visible) input.current?.focus();
      }}
      width={720}
      rootClassName="filumo-doc-search-modal"
      centered
    >
      <Input
        ref={input}
        value={keywords}
        disabled={!ready}
        aria-label={en ? 'Search keywords' : '搜索关键字'}
        placeholder={
          en ? 'Search APIs, formats and guides' : '搜索 API、格式或接入指南'
        }
        onChange={(event) => {
          setKeywords(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            focusHint(0);
          }
        }}
        onPressEnter={(event) => {
          if (!event.nativeEvent.isComposing)
            results.current?.querySelector<HTMLAnchorElement>('a')?.click();
        }}
        allowClear
      />
      <div
        ref={results}
        className="filumo-doc-search-results"
        aria-busy={!failed && (!ready || loading)}
        onKeyDown={(event) => {
          if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
          const links = Array.from(
            results.current?.querySelectorAll<HTMLAnchorElement>('a') ?? [],
          );
          const index = links.indexOf(
            document.activeElement as HTMLAnchorElement,
          );
          if (index < 0) return;
          event.preventDefault();
          if (event.key === 'ArrowUp' && index === 0) input.current?.focus();
          else
            focusHint(
              Math.max(
                0,
                Math.min(
                  links.length - 1,
                  index + (event.key === 'ArrowDown' ? 1 : -1),
                ),
              ),
            );
        }}
      >
        {failed ? (
          <p role="alert">
            {en
              ? 'Unable to load the search index. Close and reopen to retry.'
              : '索引加载失败，请关闭后重新打开重试。'}
          </p>
        ) : !ready || (loading && keywords.trim()) ? (
          <p role="status">{en ? 'Searching…' : '正在查找…'}</p>
        ) : !keywords.trim() ? (
          <p>
            {en
              ? 'Enter keywords to search the public documentation.'
              : '输入关键字查找公开文档内容。'}
          </p>
        ) : !hints.length ? (
          <p role="status">
            {en ? 'No matching documentation.' : '没有匹配的文档。'}
          </p>
        ) : (
          <ul>
            {hints.map((hint, index) => (
              <li key={hint.link + ':' + index}>
                <Link to={hint.link} onClick={onClose}>
                  <small>{hint.pageTitle}</small>
                  <strong>{text(hint.highlightTitleTexts)}</strong>
                  <span>{text(hint.highlightTexts)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
