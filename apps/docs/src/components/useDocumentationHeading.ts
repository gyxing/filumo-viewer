import { useEffect, useState } from 'react';
import type { DocumentationTreeNode } from './documentation-tree';

/** 按正文阅读位置更新章节；仅观察窗口滚动，不被目录自身滚动影响。 */
export function useDocumentationHeading(
  headings: readonly DocumentationTreeNode[],
  pathname: string,
  loading: boolean,
): string | undefined {
  const [active, setActive] = useState<{ pathname: string; key?: string }>({
    pathname,
  });
  useEffect(() => {
    if (loading) return;
    const targets = headings.flatMap((node) => {
      const element = node.id ? document.getElementById(node.id) : null;
      return element ? [{ node, element }] : [];
    });
    let frame = 0;
    const update = () => {
      frame = 0;
      const offset = targets[0]
        ? Number.parseFloat(
            window.getComputedStyle(targets[0].element).scrollMarginTop,
          ) || 92
        : 92;
      let key: string | undefined;
      for (const { node, element } of targets) {
        if (element.getBoundingClientRect().top > offset + 1) break;
        key = node.key;
      }
      // 页面到底时最后一节可能无法顶到吸顶位置，仍应选中可见的末节。
      if (
        targets.length &&
        window.scrollY > 0 &&
        window.scrollY + window.innerHeight >=
          document.documentElement.scrollHeight - 1
      )
        key = targets[targets.length - 1].node.key;
      setActive((previous) =>
        previous.pathname === pathname && previous.key === key
          ? previous
          : { pathname, key },
      );
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.cancelAnimationFrame(frame);
    };
  }, [headings, loading, pathname]);
  return active.pathname === pathname && !loading ? active.key : undefined;
}
