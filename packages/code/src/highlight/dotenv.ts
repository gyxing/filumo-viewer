import type { LanguageFn, Mode } from 'highlight.js';

/** 环境配置只做键值着色，变量引用和命令内容始终保留为原文。 */
const dotenv: LanguageFn = (hljs) => {
  const variable: Mode = {
    scope: 'variable',
    begin: /\$\{[^}\r\n]+\}|\$[a-z_]\w*/i,
  };
  const quoted = [
    hljs.inherit(hljs.APOS_STRING_MODE, { illegal: undefined }),
    hljs.inherit(hljs.QUOTE_STRING_MODE, {
      illegal: undefined,
      contains: [hljs.BACKSLASH_ESCAPE, variable],
    }),
  ];
  return {
    name: 'Environment variables',
    contains: [
      hljs.HASH_COMMENT_MODE,
      { scope: 'keyword', begin: /\bexport(?=[ \t]+[a-z_][\w.-]*[ \t]*=)/i },
      { scope: 'attr', begin: /[a-z_][\w.-]*(?=[ \t]*=)/i },
      {
        scope: 'string',
        begin: /=/,
        end: /$/,
        excludeBegin: true,
        // 引号内的 # 是值的一部分；仅未被字符串包裹的内容参与注释识别。
        contains: [...quoted, variable, hljs.HASH_COMMENT_MODE],
      },
    ],
  };
};

export default dotenv;
