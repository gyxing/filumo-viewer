import type { ArchiveEntry } from '../reader/contracts';
export function formatArchiveSize(bytes: number) {
  if (!Number.isFinite(bytes)) return '—';
  for (const [unit, divisor] of [
    ['GiB', 1024 ** 3],
    ['MiB', 1024 ** 2],
    ['KiB', 1024],
  ] as const)
    if (bytes >= divisor) return (bytes / divisor).toFixed(1) + ' ' + unit;
  return bytes + ' B';
}
/** 目录列表按可见行创建 DOM，过滤只作用于文件名，不主动解压正文。 */
export class ArchiveList {
  readonly element: HTMLElement;
  private body: HTMLElement;
  private rows: ArchiveEntry[] = [];
  private frame?: number;
  private resize?: ResizeObserver;
  private selected?: string;
  constructor(
    private document: Document,
    private open: (entry: ArchiveEntry) => void,
    private en: boolean,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'filumo-archive-list';
    this.element.tabIndex = 0;
    this.element.setAttribute('role', 'listbox');
    this.body = document.createElement('div');
    this.body.className = 'filumo-archive-list-canvas';
    this.element.append(this.body);
    this.element.onscroll = () => this.schedule();
    const Resize = document.defaultView?.ResizeObserver;
    if (Resize) {
      this.resize = new Resize(() => this.schedule());
      this.resize.observe(this.element);
    }
  }
  update(
    entries: readonly ArchiveEntry[],
    directory: string,
    query: string,
    sort: 'name' | 'size',
    selected?: string,
  ) {
    const rows: ArchiveEntry[] = [],
      dirs = new Set<string>(),
      prefix = directory ? directory + '/' : '';
    for (const entry of entries) {
      if (!entry.path.startsWith(prefix)) continue;
      const rest = entry.path.slice(prefix.length);
      if (!rest) continue;
      if (query) {
        if (entry.path.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
          rows.push(entry);
        continue;
      }
      const slash = rest.indexOf('/');
      if (slash >= 0) {
        const path = prefix + rest.slice(0, slash);
        if (!dirs.has(path)) {
          dirs.add(path);
          rows.push({ id: 'dir:' + path, path, kind: 'directory', size: 0 });
        }
      } else if (entry.kind !== 'directory' || !dirs.has(entry.path)) {
        if (entry.kind === 'directory') dirs.add(entry.path);
        rows.push(entry);
      }
    }
    rows.sort(
      (a, b) =>
        Number(b.kind === 'directory') - Number(a.kind === 'directory') ||
        (sort === 'size' ? b.size - a.size : 0) ||
        a.path.localeCompare(b.path),
    );
    this.rows = rows;
    this.selected = selected;
    this.body.style.height = rows.length * 36 + 'px';
    this.draw();
  }
  private schedule() {
    if (this.frame !== undefined) return;
    this.frame = this.document.defaultView?.requestAnimationFrame(() => {
      this.frame = undefined;
      this.draw();
    });
  }
  /** 语言改变只更新本层标签，不重建归档来源或清空目录。 */
  setLocale(en: boolean) {
    this.en = en;
    this.draw();
  }
  private draw() {
    const begin = Math.max(0, Math.floor(this.element.scrollTop / 36) - 4),
      end = Math.min(
        this.rows.length,
        begin + Math.ceil((this.element.clientHeight || 500) / 36) + 8,
      );
    this.body.replaceChildren();
    for (let index = begin; index < end; index++) {
      const entry = this.rows[index],
        row = this.document.createElement('button');
      row.type = 'button';
      row.className = 'filumo-archive-row';
      row.style.top = index * 36 + 'px';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(entry.id === this.selected));
      row.title = entry.error ?? entry.path;
      const icon = this.document.createElementNS(
        'http://www.w3.org/2000/svg',
        'svg',
      );
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('width', '16');
      icon.setAttribute('height', '16');
      icon.setAttribute('fill', 'none');
      icon.setAttribute('stroke', 'currentColor');
      icon.setAttribute('stroke-width', '1.5');
      icon.setAttribute('aria-hidden', 'true');
      icon.classList.add('filumo-archive-entry-icon');
      const path = this.document.createElementNS(icon.namespaceURI, 'path');
      path.setAttribute(
        'd',
        entry.kind === 'directory'
          ? 'M3 5h7l2 3h9v12H3Z'
          : 'M5 3h9l5 5v13H5ZM14 3v6h5M8 13h8M8 17h6',
      );
      icon.append(path);
      const name = this.document.createElement('span');
      name.className = 'filumo-archive-entry-name';
      name.textContent = entry.path.split('/').pop() ?? entry.path;
      const size = this.document.createElement('span');
      size.className = 'filumo-archive-entry-size';
      size.textContent =
        entry.kind === 'directory'
          ? this.en
            ? 'Folder'
            : '文件夹'
          : formatArchiveSize(entry.size);
      row.append(icon, name, size);
      row.onclick = () => this.open(entry);
      this.body.append(row);
    }
    if (!this.rows.length) {
      const empty = this.document.createElement('p');
      empty.textContent = this.en ? 'No matching files' : '没有匹配的文件';
      this.body.append(empty);
    }
  }
  dispose() {
    this.resize?.disconnect();
    if (this.frame !== undefined)
      this.document.defaultView?.cancelAnimationFrame(this.frame);
    this.element.remove();
  }
}
