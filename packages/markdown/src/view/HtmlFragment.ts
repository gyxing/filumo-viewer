import { HtmlFragment as SharedHtmlFragment } from '@filumo/dom/html';
import type { MarkdownToken } from '../parser/types';
export type { HtmlFragmentOptions } from '@filumo/dom/html';
/** Markdown 保留 token 类型，节点重建与样式规则由公共 HTML 模块提供。 */
export class HtmlFragment extends SharedHtmlFragment<MarkdownToken> {}
