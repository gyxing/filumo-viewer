import React, { useState } from 'react';
import { docsPath } from '../site-path';
import { DocumentationHeader } from './DocumentationHeader';
import './FilumoPlaygroundPage.less';
import { PlaygroundCodePanel } from './PlaygroundCodePanel';
import { PlaygroundControlPanel } from './PlaygroundControlPanel';
import { PlaygroundPreview } from './PlaygroundPreview';
import { SiteFooter } from './SiteFooter';
import { getWebsiteContent, type WebsiteLocale } from './home-content';
import { createPlaygroundConfig } from './playground-config';
import { getPlaygroundContent } from './playground-content';

/** 公开体验页复用官网导航，按参数、预览、代码职责组织双栏工作区。 */
export function FilumoPlaygroundPage({
  locale = 'zh-CN',
}: {
  locale?: WebsiteLocale;
}) {
  const [file, setFile] = useState<File>();
  const [config, setConfig] = useState(() => createPlaygroundConfig(locale));
  const content = getPlaygroundContent(locale);
  const website = getWebsiteContent(locale);
  return (
    <div className="office-viewer-site filumo-playground" lang={locale}>
      <a className="office-viewer-site-skip" href="#playground-main">
        {website.skipToContent}
      </a>
      <DocumentationHeader locale={locale} page="playground" />
      <main id="playground-main" className="filumo-playground-main">
        <section
          className="filumo-playground-intro"
          aria-labelledby="playground-title"
        >
          <span className="office-viewer-site-eyebrow">{content.eyebrow}</span>
          <h1 id="playground-title">{content.title}</h1>
          <p>{content.description}</p>
          <div className="filumo-playground-privacy">
            <span aria-hidden="true" />
            {content.privacy}
          </div>
        </section>
        <div className="filumo-playground-workspace">
          <PlaygroundControlPanel
            config={config}
            content={content}
            onChange={setConfig}
            onReset={() => setConfig(createPlaygroundConfig(locale))}
          />
          <div className="filumo-playground-result">
            <PlaygroundPreview
              file={file}
              config={config}
              content={content}
              onFile={setFile}
            />
            <PlaygroundCodePanel
              config={config}
              content={content}
            />
            <a
              className="filumo-playground-guide"
              href={docsPath(
                (locale === 'zh-CN' ? 'zh-CN/' : '') +
                  'docs/guides/preview-integration',
              )}
            >
              {content.help} →
            </a>
          </div>
        </div>
      </main>
      <SiteFooter content={website} />
    </div>
  );
}
