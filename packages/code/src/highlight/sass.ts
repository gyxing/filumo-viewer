import type { LanguageFn, Mode } from 'highlight.js';

/** Sass 缩进源码的轻量着色规则，不编译样式，也不依赖 SCSS 的花括号结构。 */
const sass: LanguageFn = (hljs) => {
  const variable: Mode = { scope: 'variable', begin: /\$[a-z_][\w-]*/i };
  const number: Mode = {
    scope: 'number',
    begin: /#[\da-f]{3,8}\b|(?:\b\d+(?:\.\d+)?|\.\d+)(?:%|[a-z]+)?/i,
    relevance: 0,
  };
  const interpolation: Mode = {
    begin: /#\{/,
    end: /\}/,
    contains: [variable, number],
  };
  const strings: Mode[] = [hljs.QUOTE_STRING_MODE, hljs.APOS_STRING_MODE].map(
    (mode) =>
      hljs.inherit(mode, { contains: [hljs.BACKSLASH_ESCAPE, interpolation] }),
  );
  return {
    name: 'Sass',
    case_insensitive: true,
    keywords: { literal: 'true false null' },
    contains: [
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      ...strings,
      interpolation,
      variable,
      // 声明和缩进嵌套属性以冒号后的空白或行末区分，避免把 a:hover 当属性。
      { scope: 'attribute', begin: /[a-z_-][\w-]*(?=[ \t]*:(?:[ \t]|$))/im },
      { scope: 'keyword', begin: /@[a-z-]+\b/i },
      { scope: 'meta', begin: /!(?:important|default|global)\b/i },
      { scope: 'title.function', begin: /^[ \t]*[=+][a-z_][\w-]*/im },
      { scope: 'built_in', begin: /[a-z_][\w-]*(?:\.[a-z_][\w-]*)*(?=\()/i },
      number,
      { scope: 'selector-class', begin: /\.[a-z_][\w-]*/i },
      { scope: 'selector-id', begin: /#[a-z_][\w-]*/i },
      { scope: 'selector-pseudo', begin: /::?[a-z-]+/i },
      { scope: 'selector-tag', begin: /&/ },
      { scope: 'selector-attr', begin: /\[/, end: /\]/, contains: strings },
    ],
  };
};

export default sass;
