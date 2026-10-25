import React from 'react';
import { FORMAT_CATALOG } from './format-catalog';
import './format-catalog.less';
import type { WebsiteLocale } from './home-content';

const COPY = {
  'en-US': {
    title: 'Complete format list',
    description:
      'Default recognized extensions and filenames, grouped by plugin. Extensions are case-insensitive; recognition is followed by content validation.',
    plugins: 'plugins',
    names: 'Filenames and variants',
  },
  'zh-CN': {
    title: '完整格式清单',
    description:
      '按插件列出默认识别的全部后缀与文件名。扩展名不区分大小写，识别后仍需通过实际内容校验。',
    plugins: '类插件',
    names: '文件名及变体',
  },
};

/** 在概览卡片下方直接展示完整范围；仅渲染轻量文档数据，不加载任何格式运行时。 */
export function FormatCatalog({ locale }: { locale: WebsiteLocale }) {
  const copy = COPY[locale];
  return (
    <div
      className="filumo-format-catalog"
      id="format-catalog"
      aria-labelledby="format-catalog-title"
    >
      <div className="filumo-format-catalog-header">
        <div>
          <h3 id="format-catalog-title">{copy.title}</h3>
          <p>{copy.description}</p>
        </div>
        <span>
          {FORMAT_CATALOG.length} {copy.plugins}
        </span>
      </div>
      <dl className="filumo-format-catalog-list">
        {FORMAT_CATALOG.map((entry) => (
          <div className="filumo-format-catalog-row" key={entry.id}>
            <dt>
              <strong>{entry.label[locale]}</strong>
              <code>@filumo/{entry.id}</code>
            </dt>
            <dd>
              <dl className="filumo-format-catalog-groups">
                {entry.groups.map((group) => (
                  <div key={group.id}>
                    <dt>{group.label[locale]}</dt>
                    <dd>
                      <div className="filumo-format-catalog-values">
                        {group.extensions.map((extension) => (
                          <code key={extension}>{extension}</code>
                        ))}
                      </div>
                      {group.fileNames?.length || group.patterns?.length ? (
                        <div className="filumo-format-catalog-names">
                          <span>{copy.names}</span>
                          <div className="filumo-format-catalog-values">
                            {[
                              ...(group.fileNames ?? []),
                              ...(group.patterns ?? []),
                            ].map((name) => (
                              <code key={name}>{name}</code>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="filumo-format-catalog-note">{entry.note[locale]}</p>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
