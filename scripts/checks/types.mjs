import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePackageMetadata } from '../build/metadata.mjs';
import { runPnpm } from '../testing/package-manager.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
await preparePackageMetadata(root);
for (const name of ['core', 'dom', 'office', 'react', 'vue', 'vue2', 'viewer'])
  execFileSync(
    process.execPath,
    [
      join(root, 'node_modules/typescript/bin/tsc'),
      '-p',
      join(root, 'packages', name, 'tsconfig.json'),
      '--noEmit',
      '--emitDeclarationOnly',
      'false',
    ],
    { cwd: root, stdio: 'inherit' },
  );
runPnpm(['--filter', 'fivo-docs', 'run', 'setup'], {
  cwd: root,
  stdio: 'inherit',
});
execFileSync(
  process.execPath,
  [
    join(root, 'node_modules/typescript/bin/tsc'),
    '--noEmit',
    '-p',
    join(root, 'apps/docs/tsconfig.json'),
  ],
  { cwd: root, stdio: 'inherit' },
);
