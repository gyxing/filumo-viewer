/** 只设置明确允许的属性；文本必须通过 textContent，拒绝事件属性与 HTML 注入。 */
export function updateAttributes(
  element: Element,
  attributes: Readonly<
    Record<string, string | number | boolean | undefined | null>
  >,
): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (
      /^on/i.test(name) ||
      name === 'innerHTML' ||
      name === 'outerHTML' ||
      name === 'srcdoc'
    )
      throw new Error('不允许的 DOM 属性：' + name);
    if (
      (name === 'href' || name === 'src' || name === 'xlink:href') &&
      typeof value === 'string' &&
      /^(javascript|vbscript):/i.test(value.replace(/[\u0000-\u0020]/g, ''))
    )
      throw new Error('不安全的 DOM 地址');
    if (value === undefined || value === null || value === false)
      element.removeAttribute(name);
    else element.setAttribute(name, value === true ? '' : String(value));
  }
}
