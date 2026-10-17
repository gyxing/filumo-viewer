import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePackageMetadata } from '../build/metadata.mjs';
import { runPnpm } from '../testing/package-manager.mjs';
import { WORKSPACE_PACKAGES } from '../workspace-packages.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
await preparePackageMetadata(root);
for (const { name } of WORKSPACE_PACKAGES)
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
