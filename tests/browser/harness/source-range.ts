import { archive } from '@filumo/archive';
import { normalizeSource, type DocumentSource } from '@filumo/core';
import { createViewer } from '@filumo/dom';
import { image } from '@filumo/image';
import { pdf } from '@filumo/pdf';

const host = document.createElement('div');
document.body.append(host);
let source: DocumentSource | undefined;
const viewer = createViewer(host, {
  height: 600,
  plugins: [pdf(), image(), archive()],
});

// 夹具只通过真实公开 API 操作来源，产品代码不增加测量接口。
Object.assign(window, {
  filumoSourceRange: {
    async probe(url: string) {
      await source?.dispose();
      source = await normalizeSource(url, { baseUrl: location.href });
      const abort = new AbortController();
      const results = [];
      for (const length of [8, 32, 65536])
        results.push((await source.readRange!(0, length, abort.signal)).length);
      return { lengths: results, size: source.size };
    },
    async open(url: string) {
      await viewer.open(url);
    },
    async dispose() {
      await Promise.all([source?.dispose(), viewer.destroy()]);
    },
    getSnapshot: () => viewer.getSnapshot(),
  },
});
document.body.dataset.ready = 'true';
