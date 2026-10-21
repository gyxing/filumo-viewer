import { createSession } from '@filumo/core';
import type { ViewerPlugin } from '@filumo/dom';
import { DocumentViewer } from '@filumo/react';
import React, { useMemo } from 'react';
import type { useSmokeController } from './useSmokeController';

// 仅作为烟测宿主内容使用，不发布新格式，也不引入 Office 解析器。
const plugins: readonly ViewerPlugin[] = [
  {
    document: {
      id: 'probe',
      protocolVersion: 1,
      extensions: ['.probe'],
      mimeTypes: [],
      detect: async () => true,
      load: async () => ({
        open: async (source, context) =>
          createSession({ ...context, source, format: 'probe', data: {} }),
      }),
    },
    loadView: async () => ({
      mount: async (context) => {
        const content =
          context.container.ownerDocument.createElement('article');
        content.className = 'smoke-probe-content';
        const title = context.container.ownerDocument.createElement('h2');
        title.textContent = '宿主内容外壳';
        const message = context.container.ownerDocument.createElement('p');
        message.textContent = '就绪：无分页能力';
        const note = context.container.ownerDocument.createElement('p');
        note.textContent =
          '用于检查通用工具栏、主题、尺寸、停用和销毁，不创建 Office 会话。';
        content.append(title, message, note);
        context.container.append(content);
        return {
          update() {},
          setActive(active) {
            content.hidden = !active;
          },
          async dispose() {
            content.remove();
          },
        };
      },
    }),
  },
];

/** 在同一工作台切换到非 Office 测试插件，复用真实 React 适配与 DOM 外壳。 */
export function DomShellProbe({
  controller: c,
}: {
  controller: ReturnType<typeof useSmokeController>;
}) {
  const source = useMemo(() => new File(['Filumo DOM shell'], 'shell.probe'), []);
  return (
    <DocumentViewer
      key={c.generation}
      ref={c.handle}
      source={source}
      plugins={plugins}
      options={c.config.viewer}
      onReady={() => {
        c.handle.current?.setActive(c.active);
        c.log('ready', 'DOM 外壳已就绪，无分页能力');
      }}
      onError={(error) => c.log('error', error)}
      onStateChange={c.updateState}
      onCapabilitiesChange={c.setCapabilities}
    />
  );
}
