import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withDocsBase } from '../../apps/docs/config/base-path.js';
import '../testing/generate-samples.mjs';
import { runPnpm } from '../testing/package-manager.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const mode = process.argv[2];
if (!['dev', 'build', 'smoke'].includes(mode))
  throw Error('只允许 dev/build/smoke');
runPnpm(['run', 'build'], { cwd: root, stdio: 'inherit' });
runPnpm(['--filter', 'fivo-docs', 'run', 'setup'], {
  cwd: root,
  stdio: 'inherit',
});
const cli = resolve(root, 'apps/docs/node_modules/dumi/bin/dumi.js');
const child = spawn(
  process.execPath,
  [cli, mode === 'build' ? 'build' : 'dev'],
  {
    cwd: resolve(root, 'apps/docs'),
    stdio: ['inherit', 'pipe', 'inherit'],
    windowsHide: true,
    env: {
      ...process.env,
      FIVO_SMOKE: mode === 'smoke' ? '1' : '0',
      NODE_ENV: mode === 'build' ? 'production' : 'development',
      HOST: '127.0.0.1',
    },
  },
);
let startupOutput = '';
let entryPrinted = false;
child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  if (mode !== 'smoke' || entryPrinted) return;
  startupOutput = (startupOutput + String(chunk)).slice(-4096);
  const origin = startupOutput.match(
    /https?:\/\/(?:127\.0\.0\.1|localhost):\d+/,
  )?.[0];
  if (origin) {
    entryPrinted = true;
    console.log(
      '烟测工作台：' +
        origin +
        withDocsBase(process.env.FIVO_DOCS_BASE, 'dev/smoke-test'),
    );
  }
});
child.on('error', (error) => {
  console.error('文档服务启动失败：' + error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal));
child.on('exit', (code) => (process.exitCode = code ?? 1));
