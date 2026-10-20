import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const engineSource = `export const version='6.4.299';
export class PDFWorker { destroy(){globalThis.pdfFixturePdfWorkerDestroy++;} }
export function getDocument(options){
  if(options.data)structuredClone(options.data,{transfer:[options.data.buffer]});
  const document={numPages:2,getPage:async()=>({rotate:0,getViewport:()=>({width:612,height:792})}),destroy:async()=>{}};
  let resolve;const task={promise:new Promise((yes)=>{resolve=yes;}),destroy:async()=>{globalThis.pdfFixtureTaskDestroy++;}};
  queueMicrotask(()=>{
    if(globalThis.pdfFixturePassword)task.onPassword(function reply(value){if(value==='fixture')resolve(document);else task.onPassword(reply,2);},1);
    else resolve(document);
  });return task;
}`;
const engineUrl =
  'data:text/javascript;base64,' + Buffer.from(engineSource).toString('base64');
const result = await build({
  entryPoints: ['packages/pdf/src/runtime/PdfSession.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  loader: { '.less': 'empty' },
  plugins: [
    {
      name: 'pdf-session-fixture-assets',
      setup(builder) {
        builder.onResolve({ filter: /^\.\/pdfAssets$/ }, () => ({
          path: 'assets',
          namespace: 'fixture',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: `export async function getPdfAssets(){return {display:${JSON.stringify(
            engineUrl,
          )}}}`,
          loader: 'js',
        }));
      },
    },
  ],
});
const { PdfSession } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(result.outputFiles[0].text).toString('base64')
);
function create(password = false) {
  globalThis.pdfFixturePassword = password;
  globalThis.pdfFixturePdfWorkerDestroy = 0;
  globalThis.pdfFixtureTaskDestroy = 0;
  const bytes = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8);
  let terminated = 0;
  const session = new PdfSession(
    { readAll: async () => bytes, dispose: async () => {} },
    {
      sessionId: 'fixture',
      signal: new AbortController().signal,
      reportProgress() {},
    },
    {
      workerFactory: () => ({
        terminate() {
          terminated++;
        },
      }),
    },
  );
  return { session, bytes, terminated: () => terminated };
}
test('引擎接收独立可转移副本，重复销毁不重复关闭 Worker', async () => {
  const { session, bytes, terminated } = create();
  await session.initialize();
  assert.equal(session.getSnapshot().phase, 'ready');
  assert.equal(bytes.byteLength, 8);
  await session.dispose();
  await session.dispose();
  assert.equal(terminated(), 1);
  assert.equal(globalThis.pdfFixturePdfWorkerDestroy, 1);
  assert.equal(globalThis.pdfFixtureTaskDestroy, 1);
});
test('密码恢复先交付，同会话错误密码可重试且快照不保存密码', async () => {
  const { session } = create(true);
  try {
    await session.initialize();
    assert.equal(session.getSnapshot().phase, 'password');
    session.submitPassword('bad');
    assert.equal(session.getSnapshot().passwordIncorrect, true);
    const ready = new Promise((resolve) => {
      const stop = session.subscribe(() => {
        if (session.getSnapshot().phase === 'ready') {
          stop();
          resolve();
        }
      });
    });
    session.submitPassword('fixture');
    await ready;
    assert.equal(session.getSnapshot().phase, 'ready');
    assert.equal(
      JSON.stringify(session.getSnapshot()).includes('fixture'),
      false,
    );
  } finally {
    await session.dispose();
  }
});
