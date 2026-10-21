import { createViewer } from '@filumo/dom';
import { events, options, plugins, setupDemo } from '../../shared/demo';
const viewer = createViewer(document.getElementById('viewer')!, {
  plugins,
  ...options,
  ...events,
});
setupDemo(() => viewer);
window.addEventListener(
  'pagehide',
  () => {
    void viewer.destroy();
  },
  { once: true },
);
