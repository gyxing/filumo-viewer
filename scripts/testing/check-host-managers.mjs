import { execFileSync } from 'node:child_process';
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyInstalledPackages, verifyPackedFile } from './pack-packages.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
  current = JSON.parse(
    await readFile(join(root, 'tmp/testing/consumers.json'), 'utf8'),
  ),
  work = await mkdtemp(join(tmpdir(), 'fivo-host-managers-'));
const results = [];
for (const manager of ['npm', 'yarn']) {
  const directory = join(work, manager);
  await mkdir(directory);
  await cp(join(root, 'examples/vanilla'), join(directory, 'app'), {
    recursive: true,
  });
  await cp(join(root, 'examples/shared'), join(directory, 'shared'), {
    recursive: true,
  });
  const dependencies = {};
  for (const name of [
    'core',
    'dom',
    'office',
    'text',
    'json',
    'markdown',
    'viewer',
  ])
    dependencies['@fivo/' + name] =
      'file:' +
      (await verifyPackedFile(current.tarballs['@fivo/' + name])).replaceAll(
        '\\',
        '/',
      );
  const manifest = {
    name: 'fivo-' + manager + '-consumer',
    private: true,
    type: 'module',
    dependencies,
    devDependencies: { vite: '5.4.21' },
    ...(manager === 'npm'
      ? {
          overrides: Object.fromEntries(
            Object.keys(dependencies).map((name) => [name, '$' + name]),
          ),
        }
      : { resolutions: dependencies }),
  };
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify(manifest, null, 2),
  );
  const command = process.platform === 'win32' ? manager + '.exe' : manager;
  console.log('独立宿主安装：' + manager);
  execFileSync(
    command,
    manager === 'npm'
      ? [
          'install',
          '--include=dev',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
        ]
      : [
          'install',
          '--production=false',
          '--ignore-scripts',
          '--non-interactive',
        ],
    { cwd: directory, env: { ...process.env, HUSKY: '0' }, stdio: 'pipe' },
  );
  await verifyInstalledPackages(directory, current.tarballs);
  const installed = await readdir(join(directory, 'node_modules'));
  if (installed.includes('react') || installed.includes('react-dom'))
    throw new Error(manager + ' 意外安装 React');
  const fixtures = join(directory, 'app/public/fixtures');
  await mkdir(fixtures, { recursive: true });
  for (const kind of ['docx', 'xlsx', 'pptx'])
    await copyFile(
      join(root, 'tests/fixtures/public/generated/sample.' + kind),
      join(fixtures, 'sample.' + kind),
    );
  const { build } = await import(
    pathToFileURL(join(directory, 'node_modules/vite/dist/node/index.js')).href
  );
  await build({
    root: join(directory, 'app'),
    base: '/' + manager + '/',
    logLevel: 'warn',
    build: {
      outDir: join(directory, 'dist'),
      emptyOutDir: false,
      chunkSizeWarningLimit: 5000,
    },
  });
  results.push({
    id: manager,
    example: 'vanilla',
    directory,
    dist: join(directory, 'dist'),
    build: 'passed',
    reactInstalled: false,
    lockFile: manager === 'npm' ? 'package-lock.json' : 'yarn.lock',
  });
  await writeFile(
    join(root, 'tmp/testing/host-managers.json'),
    JSON.stringify({ work, cases: results }, null, 2) + '\n',
  );
}
console.log('npm / Yarn 宿主消费构建通过。');
