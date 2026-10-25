import React from 'react';
import {
  DOCUMENTATION_BASELINE,
  DOCUMENTATION_VERSIONS,
} from './documentation-release';

/** 展示构建时读取的包版本，不把源码版本误称为 npm 已发布版本。 */
export function DocumentationVersions({
  locale,
}: {
  locale: 'en-US' | 'zh-CN';
}) {
  const en = locale === 'en-US';
  return (
    <div className="filumo-doc-versions">
      <p>
        {en
          ? 'Documentation baseline (@filumo/viewer): '
          : '文档基线（@filumo/viewer）：'}
        <code>{DOCUMENTATION_BASELINE}</code>
      </p>
      <table>
        <thead>
          <tr>
            <th>{en ? 'Package' : '包'}</th>
            <th>{en ? 'Source version' : '源码版本'}</th>
            <th>{en ? 'Published versions' : '发布版本'}</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(DOCUMENTATION_VERSIONS).map(([name, version]) => (
            <tr key={name}>
              <td>
                <code>{name}</code>
              </td>
              <td>{version}</td>
              <td>
                <a
                  href={
                    'https://www.npmjs.com/package/' +
                    name +
                    '?activeTab=versions'
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  npm
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
