import type { DocumentInput } from '@filumo/core';
import { createViewer, type ViewerHandle } from '@filumo/dom';
import { image } from '@filumo/image';
import { pdf } from '@filumo/pdf';
import {
  createPdfFixture,
  imageFixture,
} from '../../fixtures/public/image-pdf/samples.mjs';
const host = document.createElement('div');
host.id = 'image-pdf-host';
document.body.append(host);
let viewer: ViewerHandle | undefined;
let sibling: ViewerHandle | undefined;
let siblingHost: HTMLElement | undefined;
/** 每次打开真实插件，不通过模拟视图替代浏览器解码及 PDF.js 绘制。 */
const kinds = [
  'image',
  'gif',
  'pdf',
  'outline',
  'reading-outline',
  'long',
  'mixed',
  'broken',
  'password',
  'scan',
  'range',
  'private',
  'full',
  'changed',
  'no-length',
  'slow',
  'budget',
  'external',
  'external-query',
  'external-prefixed',
  'worker-src',
  'worker-factory',
] as const;
async function open(kind: (typeof kinds)[number]) {
  await viewer?.destroy();
  // 外部目录与工厂使用真实 Worker，只改变夹具的公开配置。
  const pdfOptions = kind.startsWith('external')
    ? {
        assetsBaseUrl:
          (kind === 'external-prefixed' ? '/deployment-prefix' : '') +
          '/assets/pdf/assets/pdfjs/' +
          (kind === 'external-query' ? '?version=fixture' : ''),
      }
    : kind === 'worker-src'
    ? { workerSrc: '/assets/pdf/worker.js' }
    : kind === 'worker-factory'
    ? {
        workerSrc: '/must-not-request.js',
        workerFactory: () =>
          new Worker('/assets/pdf/worker.js', { type: 'module' }),
      }
    : kind === 'budget'
    ? { canvasCacheBytes: 4096, maxCanvasPixels: 1024, renderConcurrency: 1 }
    : {};
  viewer = createViewer(host, {
    height: 640,
    plugins: [image(), pdf(pdfOptions)],
  });
  let file: DocumentInput;
  if (kind === 'gif')
    file = new File(
      [
        Uint8Array.from(
          atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
          (value) => value.charCodeAt(0),
        ),
      ],
      'example.gif',
      { type: 'image/gif' },
    );
  else if (kind === 'password' || kind === 'scan')
    file = { url: '/fixtures/sample-' + kind + '.pdf', name: kind + '.pdf' };
  else if (
    ['range', 'private', 'full', 'changed', 'no-length', 'slow'].includes(kind)
  )
    file = {
      url: '/fixtures/pdf-' + kind + '.pdf',
      name: kind + '.pdf',
      request: { headers: { 'x-filumo-fixture': 'allowed' } },
    };
  else
    file =
      kind === 'image'
        ? new File([imageFixture], 'example.svg', { type: 'image/svg+xml' })
        : kind === 'broken'
        ? new File(['broken'], 'broken.pdf', { type: 'application/pdf' })
        : new File(
            [
              createPdfFixture(
                kind === 'long' ? 1000 : kind === 'reading-outline' ? 24 : 12,
                kind === 'mixed',
                kind === 'outline',
                kind === 'reading-outline',
              ),
            ],
            'example.pdf',
            { type: 'application/pdf' },
          );
  await viewer.open(file);
  document.body.dataset.ready = kind;
}
for (const kind of kinds) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = kind;
  button.onclick = () => {
    void open(kind).catch((error) => {
      document.body.dataset.error = String(error);
    });
  };
  document.body.prepend(button);
}
Object.assign(window, {
  filumoImagePdf: {
    open,
    async addSibling() {
      await sibling?.destroy();
      siblingHost?.remove();
      siblingHost = document.createElement('div');
      siblingHost.id = 'image-pdf-sibling';
      document.body.append(siblingHost);
      sibling = createViewer(siblingHost, {
        height: 480,
        plugins: [pdf()],
      });
      await sibling.open(
        new File([createPdfFixture(3, false, true)], 'sibling.pdf', {
          type: 'application/pdf',
        }),
      );
    },
    async disposeSibling() {
      await sibling?.destroy();
      sibling = undefined;
      siblingHost?.remove();
      siblingHost = undefined;
    },
    getCapabilities: () => viewer?.getCapabilities(),
    update: (options: Parameters<ViewerHandle['update']>[0]) =>
      viewer?.update(options),
    setActive: (value: boolean) => viewer?.setActive(value),
    dispose: () => viewer?.destroy(),
  },
});
