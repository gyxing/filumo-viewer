import { execFileSync, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import {
  normalizeDocsBase,
  withDocsBase,
} from '../../apps/docs/config/base-path.js';
import './generate-samples.mjs';
const base = normalizeDocsBase(process.env.FILUMO_DOCS_BASE);
const probe = createServer();
await new Promise((r) => probe.listen(0, '127.0.0.1', r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const child = spawn(
  process.execPath,
  [resolve('apps/docs/node_modules/dumi/bin/dumi.js'), 'dev'],
  {
    cwd: resolve('apps/docs'),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      FILUMO_SMOKE: '1',
      FILUMO_PUBLIC_SAMPLES_ONLY:
        process.env.FILUMO_LOCAL_SAMPLES === '1' ? '0' : '1',
      NODE_ENV: 'development',
      BROWSER: 'none',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
);
let log = '';
child.stdout.on('data', (b) => (log += b));
child.stderr.on('data', (b) => (log += b));
let ready = false;
for (let i = 0; i < 180; i++) {
  if (child.exitCode !== null) throw Error(log);
  try {
    const r = await fetch(
      'http://127.0.0.1:' + port + withDocsBase(base, '__filumo_smoke/samples'),
    );
    if (r.ok && r.headers.get('content-type')?.includes('application/json')) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
if (!ready) {
  child.kill();
  throw Error('烟测服务未就绪 ' + log.slice(-3000));
}
writeFileSync(resolve('tmp/cleanup-smoke-service.log'), log, 'utf8');
console.log('烟测：http://127.0.0.1:' + port);
for (const s of ['SIGTERM', 'SIGINT'])
  process.on(s, () => {
    if (process.platform === 'win32') {
      try {
        execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
        });
      } catch {}
    } else child.kill();
    process.exit();
  });
child.on('exit', (code) => process.exit(code ?? 1));
