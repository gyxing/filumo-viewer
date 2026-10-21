import { DocumentViewer } from '@filumo/react';
import React, { useMemo, useState } from 'react';
import type { PlaygroundConfig } from './playground-config';
import type { PlaygroundContent } from './playground-content';
import { createPlaygroundPlugins } from './playground-plugins';

/** 只通过 Filumo 公开入口预览；文件状态由真实就绪事件同步，不上传文档。 */
export function PlaygroundPreview({
  file,
  config,
  content,
  onFile,
}: {
  file?: File;
  config: PlaygroundConfig;
  content: PlaygroundContent;
  onFile(file?: File): void;
}) {
  const { office, pdf } = config;
  const plugins = useMemo(
    () => createPlaygroundPlugins({ office, pdf }),
    [office, pdf],
  );
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );
  return (
    <section
      className="filumo-playground-preview-card"
      aria-labelledby="playground-preview-title"
    >
      <div className="filumo-playground-preview-heading">
        <div>
          <h2 id="playground-preview-title">{content.preview}</h2>
          <p>{content.previewHint}</p>
        </div>
        <label className="filumo-playground-file">
          <span>{content.file}</span>
          <input
            type="file"
            aria-label={content.file}
            onChange={(event) => onFile(event.target.files?.[0])}
          />
        </label>
      </div>
      <div className="filumo-playground-file-info">
        <span title={name || file?.name}>
          {name || file?.name || content.noFile}
        </span>
        <span role="status">
          {status === 'ready'
            ? content.ready
            : status === 'error'
            ? content.error
            : status === 'loading'
            ? content.loading
            : ''}
        </span>
      </div>
      <div className="filumo-playground-preview-surface">
        <DocumentViewer
          source={file}
          plugins={plugins}
          options={config.viewer}
          onReady={(session) => {
            setName(session.source.name ?? '');
            setStatus('ready');
          }}
          onStateChange={(snapshot) => {
            if (
              snapshot.status === 'loading' ||
              snapshot.status === 'detecting'
            )
              setStatus('loading');
          }}
          onError={() => setStatus('error')}
        />
      </div>
    </section>
  );
}
