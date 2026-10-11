import type { ViewerHandle } from '@fivo/dom';
import { DocumentViewer } from '@fivo/react';
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { events, options, plugins, setupDemo } from '../../shared/demo';
let viewer: ViewerHandle | undefined;
const root = createRoot(document.getElementById('viewer')!);
root.render(
  <StrictMode>
    <DocumentViewer
      ref={(value) => {
        viewer = value ?? undefined;
      }}
      plugins={plugins}
      options={options}
      {...events}
    />
  </StrictMode>,
);
setupDemo(() => viewer);
window.addEventListener('pagehide', () => root.unmount(), { once: true });
