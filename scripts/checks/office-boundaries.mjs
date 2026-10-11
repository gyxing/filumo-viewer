import { build } from 'esbuild';
import { readdir, readFile } from 'node:fs/promises';
/** 主入口和 Worker 必须能独立构建，旧路径和框架依赖都属于违规。 */
export async function auditOffice() {
  const graphs = {};
  const violations = [];
  const engineToRenderer = [];
  const viewToRenderer = [];
  for (const [name, entry] of [
    ['runtime', 'packages/office/src/index.ts'],
    ['worker', 'packages/office/src/engine/parsing/runtime/worker/entry.js'],
  ]) {
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      packages: name === 'runtime' ? 'external' : undefined,
      loader: { '.less': 'empty' },
      metafile: true,
      logLevel: 'silent',
    });
    const refs = [
      ...Object.keys(result.metafile.inputs),
      ...Object.values(result.metafile.outputs).flatMap((x) =>
        x.imports.map((y) => y.path),
      ),
    ];
    const invalid = refs.filter((p) =>
      /[/\\]legacy[/\\]|src[/\\]office-file-viewer|(?:^|[/\\])(?:react|react-dom|vue|preact)(?:[/\\]|$)/.test(
        p,
      ),
    );
    const boundaryInvalid = refs.filter((p) => {
      const normalized = p.replaceAll('\\', '/');
      if (normalized.includes('/packages/office/src/engine/'))
        return /\/packages\/office\/src\/renderers\//.test(normalized);
      return false;
    });
    engineToRenderer.push(...boundaryInvalid);
    graphs[name] = { files: Object.keys(result.metafile.inputs).length };
    violations.push(...invalid);
  }
  const collect = async (directory) => {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = directory + '/' + entry.name;
      if (entry.isDirectory()) files.push(...(await collect(path)));
      else if (/\.(?:ts|tsx|js)$/.test(entry.name)) files.push(path);
    }
    return files;
  };
  for (const [directory, output] of [
    ['packages/office/src/engine', engineToRenderer],
    ['packages/office/src/view', viewToRenderer],
  ])
    for (const file of await collect(directory)) {
      const source = await readFile(file, 'utf8');
      if (/(?:from|import\s*\()\s*['"][^'"]*renderers\//.test(source))
        output.push(file);
    }
  const pkg = JSON.parse(
    await readFile('packages/office/package.json', 'utf8'),
  );
  for (const name of Object.keys({
    ...pkg.dependencies,
    ...pkg.peerDependencies,
  }))
    if (/^(react|react-dom|vue|preact)$/.test(name)) violations.push(name);
  return { graphs, violations, engineToRenderer, viewToRenderer };
}
if (process.argv[1]?.endsWith('office-boundaries.mjs')) {
  const result = await auditOffice();
  console.log(JSON.stringify(result, null, 2));
  if (result.violations.length) process.exitCode = 1;
}
