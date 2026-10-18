import { createShellIcon, labelShellButton } from './icons';

/** 展示面向用户的状态说明；原始错误仍通过 onError 和控制器快照交付。 */
export function createViewerStatus(
  host: HTMLElement,
  retry: HTMLButtonElement,
  open: () => void,
) {
  const document = host.ownerDocument;
  const icon = document.createElement('div');
  icon.className = 'fivo-status-icon';
  const heading = document.createElement('strong');
  heading.className = 'fivo-status-heading';
  const description = document.createElement('div');
  description.className = 'fivo-status-description';
  const actions = document.createElement('div');
  actions.className = 'fivo-status-actions';
  const choose = document.createElement('button');
  choose.type = 'button';
  choose.onclick = open;
  actions.append(choose, retry);
  const details = document.createElement('details');
  details.className = 'fivo-status-details';
  const summary = document.createElement('summary');
  const technical = document.createElement('pre');
  details.append(summary, technical);
  host.append(icon, heading, description, actions, details);
  let iconKind = '';
  return (
    kind: string,
    en: boolean,
    canRetry = false,
    inline = false,
    error?: Error,
  ) => {
    const failed = kind === 'error';
    const code = error && 'code' in error ? error.code : undefined;
    const unsupported = failed && (code === 'UNSUPPORTED_FORMAT' || code === 'UNSUPPORTED_FILE_TYPE');
    const loading = kind === 'loading' || kind === 'detecting';
    const cancelled = kind === 'cancelled';
    const name = failed ? 'error' : loading ? 'loading' : 'document';
    if (iconKind !== name) {
      icon.replaceChildren(createShellIcon(document, name));
      iconKind = name;
    }
    host.classList.toggle('fivo-status--centered', !inline);
    host.dataset.kind = kind;
    host.setAttribute('role', failed ? 'alert' : 'status');
    heading.textContent = unsupported
      ? en ? 'Unsupported format' : '暂不支持该格式'
      : failed
      ? en
        ? 'Preview failed'
        : '预览失败'
      : cancelled
      ? en
        ? 'Loading cancelled'
        : '已取消加载'
      : loading
      ? en
        ? 'Loading document…'
        : '正在加载文档…'
      : en
      ? 'Select a document to preview'
      : '请选择文档进行预览';
    description.textContent = unsupported
      ? en
        ? 'No enabled preview format matched this file, and it could not be read as plain text. Choose another file.'
        : '该文件未匹配可用的预览格式，且无法按纯文本读取，请选择其他文件。'
      : failed
      ? en
        ? 'Check that the file format is supported and the file is not damaged, then retry or choose another file.'
        : '请确认文件格式正确且文件未损坏，然后重试或选择其他文件。'
      : loading
      ? en
        ? 'Please wait while the document is prepared.'
        : '文档正在准备中，请稍候。'
      : en
      ? 'Open a file supported by the enabled document plugins.'
      : '点击打开文件，选择当前已启用格式的文档。';
    labelShellButton(choose,
      unsupported ? en ? 'Open another file' : '打开其他文件' : en ? 'Open file' : '打开文件',
      'open');
    retry.textContent = en ? 'Retry' : '重试';
    retry.hidden = !(failed && canRetry && !unsupported);
    actions.hidden = loading;
    summary.textContent = en ? 'Technical details' : '技术详情';
    technical.textContent = error?.message ?? '';
    details.hidden = !failed || !error?.message;
  };
}
