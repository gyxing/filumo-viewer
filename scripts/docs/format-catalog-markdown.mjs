/** 从轻量文档清单生成可直接在 GitHub 阅读的表格；回归测试同时防止指南内容漂移。 */
export function formatCatalogMarkdown(entries, locale) {
  const en = locale === 'en-US';
  const codeList = (items = []) =>
    items.length ? items.map((item) => '`' + item + '`').join(', ') : '-';
  return entries
    .map((entry) => {
      const header = en
        ? '| Group | Extensions | Filenames and variants |'
        : '| 分组 | 扩展名 | 文件名及变体 |';
      const rows = entry.groups.map(
        (group) =>
          '| ' +
          group.label[locale] +
          ' | ' +
          codeList(group.extensions) +
          ' | ' +
          codeList([...(group.fileNames ?? []), ...(group.patterns ?? [])]) +
          ' |',
      );
      return [
        '### ' + entry.label[locale] + ' · @filumo/' + entry.id,
        '',
        header,
        '| --- | --- | --- |',
        ...rows,
        '',
        entry.note[locale],
      ].join('\n');
    })
    .join('\n\n');
}
