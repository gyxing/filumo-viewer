import type { DocumentInput } from '@fivo/core';
import { createViewer, type ViewerHandle } from '@fivo/dom';
import { image } from '@fivo/image';
import { pdf } from '@fivo/pdf';
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
] as const;
async function open(kind: (typeof kinds)[number]) {
  await viewer?.destroy();
  viewer = createViewer(host, {
    height: 640,
    plugins: [
      image(),
      pdf({
        assetsBaseUrl: new URL('/assets/pdf/assets/pdfjs/', location.href).href,
      }),
    ],
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
      request: { headers: { 'x-fivo-fixture': 'allowed' } },
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
  fivoImagePdf: {
    open,
    async addSibling() {
      await sibling?.destroy();
      siblingHost?.remove();
      siblingHost = document.createElement('div');
      siblingHost.id = 'image-pdf-sibling';
      document.body.append(siblingHost);
      sibling = createViewer(siblingHost, {
        height: 480,
        plugins: [
          pdf({
            assetsBaseUrl: new URL('/assets/pdf/assets/pdfjs/', location.href)
              .href,
          }),
        ],
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
