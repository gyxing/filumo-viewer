// 文档排版使用 HTML 命名空间；页面脚本、嵌入内容和样式定义整体丢弃。
export const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
export const blockedHtmlTags = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base',
  'template', 'svg', 'math', 'noscript', 'title', 'audio', 'video', 'source',
]);
export const allowedHtmlTags = new Set([
  'p', 'div', 'span', 'section', 'article', 'main', 'header', 'footer', 'aside',
  'nav', 'address', 'br', 'wbr', 'hr', 'strong', 'b', 'em', 'i', 'u', 's',
  'del', 'ins', 'mark', 'sup', 'sub', 'small', 'kbd', 'samp', 'var', 'abbr',
  'cite', 'q', 'time', 'bdi', 'bdo', 'ruby', 'rt', 'rp',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'blockquote', 'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'colgroup', 'col', 'a', 'img', 'figure', 'figcaption', 'pre', 'code',
  'details', 'summary', 'input', 'font', 'center', 'strike',
]);

/** 将常见 HTML 尺寸规范为 CSS 长度，限制巨大值和超出容器的百分比。 */
export function htmlDimension(
  value: string | null | undefined,
): string | undefined {
  const match = value?.trim().match(/^(\d+(?:\.\d+)?)(px|em|rem|pt|%)?$/i);
  if (!match) return;
  const number = Number(match[1]),
    unit = (match[2] ?? 'px').toLowerCase();
  const limit = unit === '%' ? 100
    : unit === 'em' || unit === 'rem' ? 256
    : unit === 'pt' ? 3072 : 4096;
  return number <= limit ? number + unit : undefined;
}

/** 样式仅保留局部阅读排版，不接纳资源地址、宿主变量和页面定位规则。 */
export function allowedHtmlStyle(property: string, value: string): boolean {
  if (!value || value.length > 256 || /(?:url\s*\(|expression\s*\(|var\s*\(|attr\s*\(|[{}@\\])/i.test(value))
    return false;
  switch (property) {
    case 'color':
    case 'background-color':
      return true;
    case 'text-align': return /^(left|right|center|justify|start|end)$/.test(value);
    case 'vertical-align': return /^(top|middle|bottom|baseline|sub|super|text-top|text-bottom)$/.test(value);
    case 'font-weight': return /^(normal|bold|bolder|lighter|[1-9]00)$/.test(value);
    case 'font-style': return /^(normal|italic|oblique)$/.test(value);
    case 'font-family': return /^[\p{L}\p{N}\s_,.'"-]{1,128}$/u.test(value);
    case 'font-size': {
      const size = value.match(/^(\d+(?:\.\d+)?)(px|pt|em|rem|%)$/);
      if (!size) return false;
      const number = Number(size[1]), unit = size[2];
      return unit === '%' ? number >= 50 && number <= 400
        : unit === 'em' || unit === 'rem' ? number >= 0.5 && number <= 4
        : unit === 'pt' ? number >= 4.5 && number <= 72
        : number >= 6 && number <= 96;
    }
    case 'text-decoration':
      return value.split(/\s+/).every((part) => ['none', 'underline', 'overline', 'line-through'].includes(part));
    case 'white-space': return /^(normal|pre|pre-wrap|pre-line|break-spaces)$/.test(value);
    case 'width':
    case 'height':
    case 'max-width': return value === 'auto' || !!htmlDimension(value);
    case 'border-collapse': return /^(collapse|separate)$/.test(value);
    case 'list-style-type': return /^(disc|circle|square|decimal|lower-alpha|upper-alpha|lower-roman|upper-roman|none)$/.test(value);
  }
  if (/^(?:margin|padding)(?:-(?:top|right|bottom|left))?$/.test(property))
    return value.split(/\s+/).every((part) => {
      if (part === 'auto') return property.startsWith('margin');
      const size = part.match(/^(\d+(?:\.\d+)?)(px|em|rem|pt|%)?$/);
      if (!size) return false;
      const number = Number(size[1]);
      return number <= (size[2] === 'em' || size[2] === 'rem' ? 6 : 96);
    });
  if (/^border(?:-(?:top|right|bottom|left))?(?:-(?:width|style|color))?$/.test(property)) {
    if (/\d(?:\.\d+)?e[+-]?\d+(?:px|em|rem|pt)/i.test(value)) return false;
    for (const match of value.matchAll(/([a-z-]+)\s*\(/gi))
      if (!['rgb', 'rgba', 'hsl', 'hsla', 'color', 'color-mix', 'lab', 'lch', 'oklab', 'oklch', 'light-dark'].includes(match[1].toLowerCase()))
        return false;
    for (const match of value.matchAll(/(-?\d+(?:\.\d+)?)(px|em|rem|pt)/gi)) {
      const width = Number(match[1]), unit = match[2].toLowerCase();
      if (width < 0 || width > (unit === 'em' || unit === 'rem' ? 1 : unit === 'pt' ? 12 : 16)) return false;
    }
    return true;
  }
  return false;
}
