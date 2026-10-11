import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  loadLocalCatalog,
  resolveSampleFile,
} from '../../../scripts/testing/local-samples.js';
import { sampleCatalog } from '../../../scripts/testing/sample-catalog.js';
import { withDocsBase } from '../config/base-path.js';
/** 同源 ID 白名单资源，绝不返回服务器绝对路径。 */
export function createSampleMiddleware(root: string, base = '/') {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    const marker = withDocsBase(base, '__fivo_smoke/');
    if (!path.startsWith(marker)) return next();
    if (!['GET', 'HEAD'].includes(req.method ?? '')) {
      res.writeHead(405).end();
      return;
    }
    try {
      const tail = path.slice(marker.length);
      const local =
        process.env.FIVO_PUBLIC_SAMPLES_ONLY === '1'
          ? {
              configured: false,
              samples: [],
              aliases: {},
              diagnostics: ['未配置本地样本，可选择公开样本或本机文件'],
            }
          : await loadLocalCatalog(root);
      const publicSamples = await sampleCatalog(root);
      if (tail === 'samples') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
          JSON.stringify({
            configured: local.configured,
            diagnostics: local.diagnostics,
            samples: [
              ...publicSamples.map((s) => ({
                id: s.id,
                label: s.id,
                format: s.format,
                extension: s.format,
                bytes: s.bytes,
              })),
              ...local.samples.map(
                (s: {
                  id: string;
                  label: string;
                  format: string;
                  extension: string;
                  bytes: number;
                  features?: string[];
                  checkpoints?: unknown[];
                }) => ({
                  id: s.id,
                  label: s.label,
                  format: s.format,
                  extension: s.extension,
                  bytes: s.bytes,
                  features: s.features,
                  checkpoints: s.checkpoints,
                }),
              ),
            ],
          }),
        );
        return;
      }
      if (!tail.startsWith('files/')) {
        res.writeHead(404).end();
        return;
      }
      const id = decodeURIComponent(tail.slice(6));
      if (!/^[a-z0-9-]+$/.test(id)) {
        res.writeHead(403).end();
        return;
      }
      const file =
        publicSamples.find((s) => s.id === id) ??
        (await resolveSampleFile(root, id, local));
      if (!file) {
        res.writeHead(404).end();
        return;
      }
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        req.method === 'HEAD' ? undefined : await readFile(file.absolute),
      );
    } catch {
      res.writeHead(403).end('样本不可用');
    }
  };
}
