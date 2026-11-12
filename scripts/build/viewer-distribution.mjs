import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import semver from 'semver';
import ts from 'typescript';

/** 合并实际模块依赖，兼容范围取更窄者，冲突直接返回构建错误。 */
function mergeRange(current, next, name) {
  if (!current || current === next) return next;
  if (semver.subset(current, next)) return current;
  if (semver.subset(next, current)) return next;
  throw Error(
    '统一包依赖范围需要明确对齐：' + name + ' ' + current + ' / ' + next,
  );
}

/** 根据模块公开合同生成统一包入口，避免另行维护格式和资源名单。 */
export function createViewerPackageContract(manifests) {
  const exports = {},
    dependencies = {},
    devDependencies = {},
    sideEffects = new Set();
  for (const [name, manifest] of Object.entries(manifests)) {
    devDependencies[manifest.name] = 'workspace:^';
    for (const [key, value] of Object.entries(manifest.exports)) {
      if (key === './package.json') continue;
      const mapTarget = (target) => {
        if (typeof target === 'string') {
          if (!target.startsWith('./dist/'))
            throw Error('模块入口超出 dist：' + manifest.name);
          return (
            './dist/modules/' + name + '/' + target.slice('./dist/'.length)
          );
        }
        return Object.fromEntries(
          Object.entries(target).map(([condition, nested]) => [
            condition,
            mapTarget(nested),
          ]),
        );
      };
      exports['./' + name + (key === '.' ? '' : key.slice(1))] =
        mapTarget(value);
    }
    for (const [dependency, range] of Object.entries(
      manifest.dependencies ?? {},
    )) {
      if (!dependency.startsWith('@filumo/'))
        dependencies[dependency] = mergeRange(
          dependencies[dependency],
          range,
          dependency,
        );
    }
    if (manifest.sideEffects === true)
      sideEffects.add('./dist/modules/' + name + '/**');
    for (const pattern of Array.isArray(manifest.sideEffects)
      ? manifest.sideEffects
      : [])
      sideEffects.add(
        './dist/modules/' +
          name +
          '/' +
          pattern.replace(/^\.\/dist\//, '').replace(/^\.\//, ''),
      );
  }
  return {
    exports,
    dependencies,
    devDependencies,
    sideEffects: [...sideEffects],
    peerDependencies: {
      react: '>=18 <20',
      'react-dom': '>=18 <20',
      vue: '^2.6.14 || ^2.7.16 || >=3.3 <4',
    },
    peerDependenciesMeta: {
      react: { optional: true },
      'react-dom': { optional: true },
      vue: { optional: true },
    },
  };
}

/** 解析模块已声明的公开入口，资源通配符只在声明范围内展开。 */
function exportTarget(manifest, subpath, types) {
  let value = manifest.exports[subpath];
  let match;
  if (!value) {
    for (const [key, target] of Object.entries(manifest.exports)) {
      if (!key.includes('*')) continue;
      const [before, after] = key.split('*');
      if (subpath.startsWith(before) && subpath.endsWith(after)) {
        match = subpath.slice(before.length, after ? -after.length : undefined);
        value = target;
        break;
      }
    }
  }
  while (value && typeof value === 'object')
    value = (types ? value.types : value.import) ?? value.default;
  if (typeof value !== 'string' || !value.startsWith('./dist/'))
    throw Error('统一包引用未公开模块入口：' + manifest.name + ' ' + subpath);
  return value.replace('*', match ?? '').slice('./dist/'.length);
}

/** 仅改写真实模块语法位置，日志、样式身份和普通字符串保持原义。 */
export function rewriteViewerImports(source, file, output, manifests) {
  if (!source.includes('@filumo/')) return source;
  const types = file.endsWith('.d.ts');
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const edits = new Map();
  const rewrite = (literal) => {
    if (!literal || !ts.isStringLiteralLike(literal)) return;
    const match = /^@filumo\/([^/]+)(\/.*)?$/.exec(literal.text);
    if (!match) return;
    const manifest = manifests[match[1]];
    if (!manifest) throw Error('统一包引用未知内部模块：' + literal.text);
    const target = resolve(
      output,
      'modules',
      match[1],
      exportTarget(manifest, match[2] ? '.' + match[2] : '.', types),
    );
    const rel = relative(resolve(output), target);
    if (!rel || rel.startsWith('..' + sep) || isAbsolute(rel))
      throw Error('统一包模块引用越界');
    let specifier = relative(dirname(file), target).replaceAll('\\', '/');
    if (!specifier.startsWith('.')) specifier = './' + specifier;
    // 声明导入指向无 .d.ts 后缀路径，兼容现有 TypeScript 解析模式。
    if (types) specifier = specifier.replace(/\.d\.ts$/, '');
    edits.set(literal.getStart(parsed), {
      end: literal.end,
      text: JSON.stringify(specifier),
    });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      rewrite(node.moduleSpecifier);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      rewrite(node.argument.literal);
    if (ts.isExternalModuleReference(node)) rewrite(node.expression);
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    )
      rewrite(node.arguments[0]);
    if (ts.isNewExpression(node) && node.expression.getText(parsed) === 'URL')
      rewrite(node.arguments?.[0]);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  for (const [start, edit] of [...edits].sort(([a], [b]) => b - a))
    source = source.slice(0, start) + edit.text + source.slice(edit.end);
  return source;
}

/** 只遍历普通构建文件，拒绝链接，避免复制范围随工作区状态扩散。 */
async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw Error('统一包构建目录包含链接：' + path);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else if (entry.isFile()) files.push(path);
    else throw Error('统一包构建目录包含非普通文件：' + path);
  }
  return files;
}

/** 复用模块编译结果和资源相对位置，生成可独立安装的统一包。 */
export async function buildViewerDistribution(root, output, names) {
  const manifests = Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [
        name,
        JSON.parse(
          await readFile(join(root, 'packages', name, 'package.json'), 'utf8'),
        ),
      ]),
    ),
  );
  const own = JSON.parse(
    await readFile(join(root, 'packages/viewer/package.json'), 'utf8'),
  );
  const contract = createViewerPackageContract(manifests);
  for (const section of [
    'dependencies',
    'peerDependencies',
    'peerDependenciesMeta',
  ]) {
    if (
      JSON.stringify(Object.entries(own[section] ?? {}).sort()) !==
      JSON.stringify(Object.entries(contract[section]).sort())
    )
      throw Error(
        '统一包 ' +
          section +
          ' 与模块合同不一致，请更新 packages/viewer/package.json',
      );
  }
  for (const [key, value] of Object.entries(contract.exports))
    if (JSON.stringify(own.exports[key]) !== JSON.stringify(value))
      throw Error('统一包公开入口不同步：' + key);
  for (const name of names) {
    const source = join(root, 'packages', name, 'dist');
    for (const file of await listFiles(source)) {
      const target = join(output, 'modules', name, relative(source, file));
      await mkdir(dirname(target), { recursive: true });
      await copyFile(file, target);
    }
    const license = join(root, 'packages', name, 'LICENSE');
    if ((await lstat(license).catch(() => undefined))?.isFile())
      await copyFile(license, join(output, 'modules', name, 'LICENSE'));
  }
  const files = await listFiles(output);
  for (const file of files) {
    if (!/\.(?:m?js|cjs|d\.ts)$/.test(file)) continue;
    const source = await readFile(file, 'utf8');
    const next = rewriteViewerImports(source, file, output, manifests);
    if (next !== source) await writeFile(file, next, 'utf8');
  }
  const manifestFile = join(output, 'build-manifest.json');
  const build = JSON.parse(await readFile(manifestFile, 'utf8'));
  build.distribution = { modules: names, internalRuntimeDependencies: [] };
  build.outputs = files
    .filter((file) => file !== manifestFile)
    .map((file) => ({ file: relative(output, file).replaceAll('\\', '/') }));
  await writeFile(manifestFile, JSON.stringify(build, null, 2) + '\n', 'utf8');
}
