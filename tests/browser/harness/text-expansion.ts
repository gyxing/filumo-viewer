import { createViewer } from '@filumo/dom';
import type { ViewerHandle } from '@filumo/dom';
import { csv } from '@filumo/csv';
import { json } from '@filumo/json';
import { xml } from '@filumo/xml';
import { code } from '@filumo/code';
import {
  expansionSamples,
  wideCsv,
} from '../../fixtures/public/text-expansion/samples.mjs';

const host = document.createElement('main');
host.style.cssText = 'width:1100px;height:600px;margin:16px;';
const controls = document.createElement('nav');
document.body.append(controls, host);
const viewer: ViewerHandle = createViewer(host, {
  plugins: [csv(), json(), xml(), code()],
  height: '100%',
});
let sibling: ViewerHandle | undefined;
let siblingHost: HTMLElement | undefined;
for (const sample of [
  ...expansionSamples,
  { id: 'csv-wide', file: 'wide.csv', format: 'csv', text: '' },
]) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = sample.id;
  button.onclick = () => {
    void viewer
      .open(
        new File(
          [sample.id === 'csv-wide' ? wideCsv() : sample.text],
          sample.file,
        ),
      )
      .then(() => {
        document.body.dataset.ready = sample.id;
      })
      .catch((error: unknown) => {
        document.body.dataset.error = String(error);
      });
  };
  controls.append(button);
}
const active = document.createElement('button');
active.type = 'button';
active.textContent = '切换激活';
let enabled = true;
active.onclick = () => {
  enabled = !enabled;
  void viewer.setActive(enabled);
};
controls.append(active);
window.addEventListener(
  'pagehide',
  () => {
    void viewer.destroy();
    void sibling?.destroy();
  },
  { once: true },
);
Object.assign(window, {
  filumoTextExpansion: {
    async addSibling() {
      await sibling?.destroy();
      siblingHost?.remove();
      siblingHost = document.createElement('div');
      siblingHost.id = 'grid-sibling';
      document.body.append(siblingHost);
      sibling = createViewer(siblingHost, { height: 240, plugins: [csv()] });
      await sibling.open(new File(['id,name\n1,A\n2,B\n'], 'sibling.csv'));
    },
    async disposeSibling() {
      await sibling?.destroy();
      sibling = undefined;
      siblingHost?.remove();
      siblingHost = undefined;
    },
    update: (options: Parameters<ViewerHandle['update']>[0]) =>
      viewer.update(options),
    setActive: (value: boolean) => viewer.setActive(value),
    getCapabilities: () => viewer.getCapabilities(),
    dispose: () => viewer.destroy(),
  },
});
