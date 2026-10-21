import { useLocation } from 'dumi';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DocumentationNav } from './DocumentationNav';
import { getWebsiteContent, type WebsiteLocale } from './home-content';

type DocumentationTocProps = {
  /** 当前目录使用的语言。 */
  locale: WebsiteLocale;
};

// 抽屉与触发按钮共享固定标识，保证无障碍关联在路由切换后保持稳定。
const TOC_DRAWER_ID = 'office-viewer-docs-toc';
// 目录只在站点双栏布局切换为单栏时启用抽屉语义。
const MOBILE_TOC_QUERY = '(max-width: 900px)';

/** 渲染桌面吸顶目录，并在窄屏复用为可访问的左侧抽屉。 */
export function DocumentationToc({ locale }: DocumentationTocProps) {
  const { pathname } = useLocation();
  const content = getWebsiteContent(locale);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  const closeDrawer = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_TOC_QUERY);
    const handleViewportChange = (event: MediaQueryListEvent) => {
      if (!event.matches) {
        setOpen(false);
      }
    };

    mediaQuery.addEventListener('change', handleViewportChange);
    return () => mediaQuery.removeEventListener('change', handleViewportChange);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      const focusable = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.offsetParent !== null);

      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer();
      } else if (event.key === 'Tab' && focusable.length > 0) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeDrawer, open]);

  const tocClassName = open
    ? 'office-viewer-docs__toc is-open'
    : 'office-viewer-docs__toc';
  const backdropClassName = open
    ? 'office-viewer-docs__toc-backdrop is-open'
    : 'office-viewer-docs__toc-backdrop';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="office-viewer-docs__toc-trigger"
        aria-expanded={open}
        aria-controls={TOC_DRAWER_ID}
        onClick={() => setOpen(true)}
      >
        {content.documentation.openToc}
      </button>
      <aside
        ref={drawerRef}
        id={TOC_DRAWER_ID}
        className={tocClassName}
        aria-label={content.documentation.tocTitle}
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
      >
        <div className="office-viewer-docs__toc-heading">
          <strong>{content.documentation.tocTitle}</strong>
          {open && (
            <button
              autoFocus
              type="button"
              className="office-viewer-docs__toc-close"
              onClick={() => closeDrawer()}
            >
              {content.documentation.closeToc}
            </button>
          )}
        </div>
        <DocumentationNav
          locale={locale}
          drawerOpen={open}
          onNavigate={() => {
            if (!open) return;
            closeDrawer(false);
            // 关闭抽屉后把键盘焦点交回正文，不能留在已隐藏的树链接上。
            window.requestAnimationFrame(() =>
              document
                .querySelector<HTMLElement>('.office-viewer-docs__article')
                ?.focus({ preventScroll: true }),
            );
          }}
        />
      </aside>
      <button
        type="button"
        className={backdropClassName}
        aria-label={content.documentation.closeToc}
        tabIndex={open ? 0 : -1}
        onClick={() => closeDrawer()}
      />
    </>
  );
}
