import { build } from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';
const built = await build({
  entryPoints: ['packages/core/src/index.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { createDocumentController, createSession } = await import(
  'data:text/javascript;base64,' +
    Buffer.from(built.outputFiles[0].text).toString('base64')
);
test('资源上下文只属于本次打开，不污染下一次', async () => {
  const contexts = [];
  const controller = createDocumentController({
    plugins: [
      {
        id: 'probe',
        protocolVersion: 1,
        extensions: [],
        mimeTypes: [],
        detect: async () => true,
        load: async () => ({
          open: async (source, context) => {
            contexts.push(context.resources);
            return createSession({
              ...context,
              source,
              format: 'probe',
              data: {},
            });
          },
        }),
      },
    ],
  });
  const resources = { resolveResource: async () => undefined };
  await controller.open(new Blob(['a']), { resources });
  await controller.open(new Blob(['b']));
  assert.equal(contexts[0], resources);
  assert.equal(contexts[1], undefined);
  await controller.destroy();
});
