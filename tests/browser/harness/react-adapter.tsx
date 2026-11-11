import { createSession } from '@filumo/core';
import type { ViewerHandle, ViewerPlugin } from '@filumo/dom';
import { DocumentViewer } from '@filumo/react';
import React, { StrictMode, Suspense, startTransition, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

const holder = { current: undefined as ViewerHandle | undefined };
const observed: string[] = [];
let attempted = '',
  setPhase: (phase: string) => void = () => {};
const never = new Promise(() => {});
const source = new Uint8Array([1]);
const plugins: ViewerPlugin[] = [
  {
    document: {
      id: 'fixture',
      protocolVersion: 1,
      extensions: [],
      mimeTypes: [],
      detect: async () => true,
      load: async () => ({
        open: async (input, context) =>
          createSession({
            ...context,
            source: input,
            format: 'fixture',
            data: {},
          }),
      }),
    },
    loadView: async () => ({
      mount: async () => ({ update() {}, setActive() {}, dispose() {} }),
    }),
  },
];
/** 真实 Suspense 留住旧提交，使丢弃渲染中的回调泄漏可以被外部事件观察。 */
function Gate({ phase }: { phase: string }) {
  attempted = phase;
  if (phase === 'discarded') throw never;
  return <span data-phase={phase} />;
}
function App() {
  const [phase, updatePhase] = useState('committed');
  setPhase = updatePhase;
  return (
    <Suspense fallback={<span>loading</span>}>
      <DocumentViewer
        ref={(value) => {
          holder.current = value ?? undefined;
        }}
        plugins={plugins}
        source={source}
        onStateChange={() => observed.push(phase)}
      />
      <Gate phase={phase} />
    </Suspense>
  );
}
const container = document.createElement('div');
document.body.append(container);
const root = createRoot(container);
root.render(React.createElement(StrictMode, null, React.createElement(App)));
Object.assign(window, {
  filumoAdapter: {
    ready: () => holder.current?.getSnapshot().status === 'ready',
    attempted: () => attempted,
    startDiscarded: () => startTransition(() => setPhase('discarded')),
    trigger() {
      holder.current!.update({ theme: 'dark' });
      return observed.at(-1);
    },
    commit() {
      flushSync(() => setPhase('next'));
    },
    dispose: () => root.unmount(),
  },
});
