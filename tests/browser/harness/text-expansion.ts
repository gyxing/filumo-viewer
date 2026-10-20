import { createViewer } from '@fivo/dom';
import type { ViewerHandle } from '@fivo/dom';
import { csv } from '@fivo/csv';
import { json } from '@fivo/json';
import { xml } from '@fivo/xml';
import { code } from '@fivo/code';
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
  },
  { once: true },
);
Object.assign(window, {
  fivoTextExpansion: {
    update: (options: Parameters<ViewerHandle['update']>[0]) =>
      viewer.update(options),
    setActive: (value: boolean) => viewer.setActive(value),
    getCapabilities: () => viewer.getCapabilities(),
    dispose: () => viewer.destroy(),
  },
});
