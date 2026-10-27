import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { WORKSPACE_PACKAGES } from '../workspace-packages.js';
import { copyArchiveAssets } from './archive-assets.mjs';
import { preparePdfDefaultAssets } from './pdf-assets.mjs';

/** 包版本与样式身份以 manifest 为唯一来源，不读取根工作区版本。 */
export async function readPackageMetadata(directory) {
  const manifest = JSON.parse(
    await readFile(join(directory, 'package.json'), 'utf8'),
  );
  if (
    !/^@filumo\/[a-z0-9-]+$/.test(manifest.name ?? '') ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
      manifest.version ?? '',
    )
  )
    throw Error('无效 Filumo 包元数据');
  const group = manifest.name.slice('@filumo/'.length);
  return {
    name: manifest.name,
    version: manifest.version,
    group,
    styleScope: WORKSPACE_PACKAGES.find((item) => item.name === group)
      ?.scopedStyles
      ? 'filumo-' + group + '-v' + manifest.version.replace(/[^a-z0-9]/gi, '-')
      : undefined,
  };
}

/** 供 build、类型检查和源码测试共用；内容未变不重写，输出不包含运行时 JSON 请求。 */
export async function preparePackageMetadata(
  root,
  names = WORKSPACE_PACKAGES.filter(
    (item) => item.name === 'dom' || item.scopedStyles,
  ).map((item) => item.name),
) {
  const packagesRoot = await realpath(join(root, 'packages'));
  for (const name of names) {
    if (!/^[a-z0-9-]+$/.test(name)) throw Error('非法包目录');
    const directory = await realpath(join(packagesRoot, name));
    if (dirname(directory) !== packagesRoot) throw Error('包路径越界');
    const metadata = await readPackageMetadata(directory);
    if (metadata.group !== name) throw Error('包名与目录不一致');
    const src = join(directory, 'src');
    if ((await realpath(src)) !== src) throw Error('源码目录不能为链接');
    const generated = join(src, 'generated');
    const info = await lstat(generated).catch((e) => {
      if (e.code === 'ENOENT') return;
      throw e;
    });
    if (info && (!info.isDirectory() || info.isSymbolicLink()))
      throw Error('生成目录不能为链接');
    await mkdir(generated, { recursive: true });
    const file = resolve(generated, 'package.ts');
    const fileInfo = await lstat(file).catch((e) => {
      if (e.code === 'ENOENT') return;
      throw e;
    });
    if (fileInfo && (!fileInfo.isFile() || fileInfo.isSymbolicLink()))
      throw Error('元数据输出不能为链接');
    const source =
      '// 自动生成自本包 package.json，请勿手工修改。\n' +
      Object.entries({
        PACKAGE_VERSION: metadata.version,
        STYLE_GROUP: metadata.group,
        STYLE_SCOPE: metadata.styleScope,
      })
        .map(
          ([key, value]) =>
            'export const ' +
            key +
            ' = ' +
            (value === undefined ? 'undefined' : JSON.stringify(value)) +
            ';',
        )
        .join('\n') +
      '\n';
    const previous = await readFile(file, 'utf8').catch((e) => {
      if (e.code === 'ENOENT') return;
      throw e;
    });
    if (previous !== source) await writeFile(file, source, 'utf8');
    if (name === 'pdf')
      await preparePdfDefaultAssets(directory, metadata.styleScope);
    if (name === 'archive')
      await copyArchiveAssets(directory, join(directory, 'src'));
  }
}
