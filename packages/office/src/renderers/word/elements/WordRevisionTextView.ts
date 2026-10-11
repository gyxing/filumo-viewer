// 从原 WordRevisionText 的完整元素分支迁移为直接 DOM 构造；不使用 React、Hook 或虚拟 DOM。
import type { WordInlineReview } from '../../../engine/word/review/types';
import {
  createDom,
  type DomChild,
  type DomMouseEvent,
} from '../../../view/dom/createDom';
import type { WordElementContext } from '../WordElementContext';
import { getWordRevisionCssVariables } from '../wordRevisionAppearance';
/** 标记态行内修订包装属性。 */
type WordRevisionTextProps = {
  /** 当前文字关联的一个或多个修订。 */
  review?: WordInlineReview;
  /** 已由格式渲染器生成的行内内容。 */
  children: DomChild;
};
/** 创建保留原绘制规则的原生元素渲染函数。 */
export function createWordRevisionTextView(context: WordElementContext) {
  /** 在 markup 模式中标记插入、删除、移动和格式变化。 */
  function WordRevisionText({ review, children }: WordRevisionTextProps) {
    const mode = context.revisionMode;
    const runtime = context.annotationRuntime;
    const revisions = review?.revisions ?? [];
    if (mode !== 'markup' || !revisions.length)
      return createDom(context.document, null, null, children);
    const kinds = new Set(revisions.map((revision) => revision.kind));
    const className = [
      'office-file-word-revision',
      kinds.has('insert') || kinds.has('move-to')
        ? 'office-file-word-revision--insert'
        : undefined,
      kinds.has('delete') || kinds.has('move-from')
        ? 'office-file-word-revision--delete'
        : undefined,
      kinds.has('format') ? 'office-file-word-revision--format' : undefined,
    ]
      .filter(Boolean)
      .join(' ');
    const latestRevision = revisions[revisions.length - 1];
    const active = runtime?.state.activeRevision?.id === latestRevision.id;
    const handleClick = (event: DomMouseEvent<HTMLSpanElement>) => {
      // Ctrl/Command + 单击优先保留超链接跳转，不用修订选择覆盖用户意图。
      if (event.ctrlKey || event.metaKey || event.defaultPrevented) return;
      event.stopPropagation();
      if (active) runtime?.actions.clearActiveRevision();
      else void runtime?.actions.activateRevisionId(latestRevision.id);
    };
    return createDom(
      context.document,
      'span',
      {
        className: className,
        'data-office-word-revision': latestRevision.id,
        'data-office-word-revision-kind': latestRevision.kind,
        'data-office-word-revision-author': latestRevision.author,
        'data-office-word-revision-created-at': latestRevision.createdAt,
        'data-active': active ? 'true' : 'false',
        style: getWordRevisionCssVariables(latestRevision),
        title: latestRevision.author,
        onClick: handleClick,
      },
      children,
    );
  }
  return WordRevisionText;
}
