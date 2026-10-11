import { createSession } from '@fivo/core';
import { createViewer } from '@fivo/dom';
import React, { useEffect, useRef, useState } from 'react';
/** 非分页测试插件只验证 DOM 外壳，不作为新格式发布。 */
export function DomShellProbe() {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('待挂载');
  useEffect(() => {
    if (!host.current) return;
    const viewer = createViewer(host.current, {
      height: 300,
      plugins: [
        {
          document: {
            id: 'probe',
            protocolVersion: 1,
            extensions: ['.probe'],
            mimeTypes: [],
            detect: async () => true,
            load: async () => ({
              open: async (source, ctx) =>
                createSession({ ...ctx, source, format: 'probe', data: {} }),
            }),
          },
          loadView: async () => ({
            mount: async (ctx) => {
              ctx.container.textContent = '非分页 DOM 插件，无 Office/页码能力';
              return {
                update() {},
                setActive(active) {
                  ctx.container.hidden = !active;
                },
                async dispose() {
                  ctx.container.replaceChildren();
                },
              };
            },
          }),
        },
      ],
    });
    void viewer
      .open(new File(['probe'], 'test.probe'))
      .then(() => setStatus('就绪：无分页能力'));
    return () => {
      void viewer.destroy();
    };
  }, []);
  return (
    <section>
      <p>{status}</p>
      <div ref={host} />
    </section>
  );
}
