import { DocumentViewer } from '@fivo/react';
import React from 'react';
import type { useSmokeController } from './useSmokeController';
/** 主预览只有一个会话 owner，卸载由适配器清理。 */
export function ViewerPanel({
  controller: c,
}: {
  controller: ReturnType<typeof useSmokeController>;
}) {
  return (
    <section aria-label="文档预览">
      {c.mounted ? (
        <DocumentViewer
          key={c.generation}
          ref={c.handle}
          source={c.source}
          plugins={c.plugins}
          options={c.config.viewer}
          onReady={() => c.log('ready', '预览就绪')}
          onError={(error) => c.log('error', error)}
          onStateChange={c.setState}
          onCapabilitiesChange={c.setCapabilities}
        />
      ) : (
        <p>已销毁，可重新打开</p>
      )}
    </section>
  );
}
