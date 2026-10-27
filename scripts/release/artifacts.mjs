import { createReadStream } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { internalDependencies, readUtf8 } from './workspace.mjs';

/** 构建清单只能指向本包的实际普通文件，不能通过路径或链接越界。 */
export async function validateBuildArtifacts(root, pkg) {
  const dist = resolve(root, 'packages', pkg.directory, 'dist');
  if (
    !(await lstat(dist).catch(() => undefined))?.isDirectory() ||
    (await realpath(dist)) !== dist
  )
    throw Error(pkg.name + ' 缺少本包构建目录，请先构建并统一验证');
  const manifest = JSON.parse(
    await readUtf8(join(dist, 'build-manifest.json')),
  );
  if (
    manifest.package !== pkg.name ||
    manifest.version !== pkg.version ||
    !manifest.outputs?.length
  )
    throw Error(pkg.name + ' 构建身份或版本不匹配，请重新构建');
  const exports = (value) =>
    typeof value === 'string'
      ? [value]
      : value && typeof value === 'object'
      ? Object.values(value).flatMap(exports)
      : [];
  const files = new Set([
    'build-manifest.json',
    ...manifest.outputs.map((output) => output.file),
    ...(manifest.worker?.outputs ?? []),
    ...(manifest.pdfAssets?.assets ?? []).map((asset) => asset.file),
    ...(manifest.archiveAssets?.assets ?? []).map((asset) => asset.file),
    ...exports(pkg.exports)
      .filter((file) => file.startsWith('./dist/') && !file.includes('*'))
      .map((file) => file.slice('./dist/'.length)),
  ]);
  for (const file of files) {
    if (typeof file !== 'string')
      throw Error(pkg.name + ' 构建清单包含无效路径');
    const path = resolve(dist, file),
      rel = relative(dist, path);
    if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel))
      throw Error(pkg.name + ' 构建资源路径越界');
    const info = await lstat(path).catch(() => undefined);
    if (
      !info?.isFile() ||
      info.isSymbolicLink() ||
      (await realpath(path)) !== path
    )
      throw Error(pkg.name + ' 构建资源缺失或为链接：' + file);
  }
}

/** 只读取 tar 中的 manifest，不把归档路径展开到磁盘；整个流校验 gzip 完整性。 */
export async function readPackedManifest(file) {
  let manifest,
    buffer = Buffer.alloc(0),
    entry,
    ended = false;
  await pipeline(createReadStream(file), createGunzip(), async (source) => {
    for await (const chunk of source) {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length) {
        if (entry) {
          if (entry.remaining) {
            const length = Math.min(buffer.length, entry.remaining);
            if (entry.capture) entry.chunks.push(buffer.subarray(0, length));
            entry.remaining -= length;
            buffer = buffer.subarray(length);
            if (entry.remaining) break;
          }
          const length = Math.min(buffer.length, entry.padding);
          entry.padding -= length;
          buffer = buffer.subarray(length);
          if (entry.padding) break;
          if (entry.capture)
            manifest = JSON.parse(
              new TextDecoder('utf-8', { fatal: true }).decode(
                Buffer.concat(entry.chunks),
              ),
            );
          entry = undefined;
          continue;
        }
        if (buffer.length < 512) break;
        const header = buffer.subarray(0, 512);
        buffer = buffer.subarray(512);
        if (header.every((byte) => byte === 0)) {
          ended = true;
          continue;
        }
        if (ended) throw Error('tar 结束标记之后存在数据');
        const field = (start, length) =>
          header
            .subarray(start, start + length)
            .toString('utf8')
            .split('\0')[0];
        const sizeText = field(124, 12).trim();
        const size = parseInt(sizeText, 8);
        const checksum = header.reduce(
          (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
          0,
        );
        if (
          !/^[0-7]+$/.test(sizeText) ||
          !Number.isSafeInteger(size) ||
          checksum !== parseInt(field(148, 8).trim(), 8)
        )
          throw Error('tar 头长度或校验和无效');
        const name = [field(345, 155), field(0, 100)].filter(Boolean).join('/');
        const capture = name === 'package/package.json';
        if (
          capture &&
          (manifest !== undefined ||
            size > 2 * 1024 * 1024 ||
            ![0, 48].includes(header[156]))
        )
          throw Error('压缩包 manifest 重复、过大或不是普通文件');
        entry = {
          remaining: size,
          padding: (512 - (size % 512)) % 512,
          capture,
          chunks: [],
        };
      }
    }
  });
  if (
    entry ||
    !ended ||
    buffer.some((byte) => byte !== 0) ||
    !manifest ||
    Array.isArray(manifest)
  )
    throw Error('压缩包缺少 manifest 或 tar 数据被截断');
  return manifest;
}

/** 比较最终 tarball 身份和内部依赖，防止发布与预览不同的 workspace 转换结果。 */
export function validatePackedManifest(manifest, pkg, packages) {
  if (
    manifest.name !== pkg.name ||
    manifest.version !== pkg.version ||
    manifest.private
  )
    throw Error('打包身份或版本不符：' + pkg.name);
  for (const section of [
    'dependencies',
    'peerDependencies',
    'optionalDependencies',
  ])
    for (const [name, range] of Object.entries(manifest[section] ?? {}))
      if (typeof range !== 'string' || /^(workspace:|file:|link:)/.test(range))
        throw Error('打包后依赖仍含本地协议：' + name);
  const expected = internalDependencies(pkg, packages);
  for (const edge of expected)
    if (manifest[edge.section]?.[edge.name] !== edge.range)
      throw Error('打包后依赖与发布计划不符：' + pkg.name + ' -> ' + edge.name);
  const actual = internalDependencies(manifest, packages);
  if (actual.length !== expected.length)
    throw Error('打包后的内部依赖集合发生变化：' + pkg.name);
}
