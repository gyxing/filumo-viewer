/** 密码只在提交时交给当前会话，不进入日志、快照或持久配置。 */
export function createPdfPassword(
  document: Document,
  incorrect: boolean,
  locale: 'zh-CN' | 'en-US' | undefined,
  submit: (value: string) => void,
): HTMLElement {
  const form = document.createElement('form');
  form.className = 'fivo-pdf-password';
  const label = document.createElement('label'),
    input = document.createElement('input'),
    button = document.createElement('button');
  label.textContent =
    locale === 'en-US'
      ? incorrect
        ? 'Incorrect password. Try again.'
        : 'Enter PDF password'
      : incorrect
      ? '密码不正确，请重试'
      : '请输入 PDF 密码';
  input.type = 'password';
  input.autocomplete = 'off';
  input.setAttribute(
    'aria-label',
    locale === 'en-US' ? 'PDF password' : 'PDF 密码',
  );
  button.type = 'submit';
  button.textContent = locale === 'en-US' ? 'Open PDF' : '打开 PDF';
  label.append(input);
  form.append(label, button);
  form.onsubmit = (event) => {
    event.preventDefault();
    const value = input.value;
    input.value = '';
    submit(value);
  };
  return form;
}
