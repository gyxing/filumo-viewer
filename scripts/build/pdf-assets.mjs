import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';

/** 提取发行 CSS 的文字层整条规则，保留嵌套样式并限定版本作用域。 */
export function extractPdfTextLayerCss(source, scope) {
  const match = /\.textLayer\s*\{/.exec(source);
  if (!match) throw Error('PDF 发行 CSS 缺少文字层');
  const start = match.index;
  let depth = 0,
    quote = '',
    comment = false,
    escaped = false;
  for (let index = source.indexOf('{', start); index < source.length; index++) {
    const char = source[index],
      next = source[index + 1];
    if (comment) {
      if (char === '*' && next === '/') {
        comment = false;
        index++;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '*') {
      comment = true;
      index++;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{') depth++;
    else if (char === '}' && --depth === 0)
      return `/* PDF.js 6.4.299, Apache-2.0; see assets/pdfjs/LICENSE. */\n.${scope} {\n${source.slice(
        start,
        index + 1,
      )}\n}\n`;
  }
  throw Error('PDF 发行 CSS 文字层规则不完整');
}

/** 仅复制固定发行包的浏览器资产，不运行第三方构建或加载 Node Canvas。 */
export async function copyPdfAssets(directory, output, scope) {
  const require = createRequire(join(directory, 'package.json'));
  const packageFile = require.resolve('pdfjs-dist/package.json');
  const metadata = JSON.parse(await readFile(packageFile, 'utf8'));
  if (metadata.version !== '6.4.299')
    throw Error('PDF.js 版本必须固定为 6.4.299');
  const root = dirname(packageFile),
    destination = join(output, 'assets/pdfjs');
  await mkdir(destination, { recursive: true });
  const assets = [];
  const copy = async (source, target, role) => {
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
    assets.push({
      file: relative(output, target).replaceAll('\\', '/'),
      role,
      source: 'pdfjs-dist/' + relative(root, source).replaceAll('\\', '/'),
    });
  };
  // 只发布实际使用的引擎和 Worker，不复制未启用的脚本沙箱及重复压缩版本。
  for (const entry of ['pdf.mjs', 'pdf.worker.mjs'])
    await copy(
      join(root, 'legacy/build', entry),
      join(destination, 'legacy/build', entry),
      entry.includes('worker') ? 'worker' : 'engine',
    );
  const walk = async (folder) => {
    for (const entry of await readdir(join(root, folder), {
      withFileTypes: true,
    })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await walk(path);
      else await copy(join(root, path), join(destination, path), 'auxiliary');
    }
  };
  for (const folder of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
    try {
      await walk(folder);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  for (const name of ['LICENSE', 'NOTICE']) {
    try {
      await copy(join(root, name), join(destination, name), 'license');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  await copy(
    join(root, 'legacy/build/pdf.worker.mjs'),
    join(output, 'worker.js'),
    'worker',
  );
  const textLayerCss = extractPdfTextLayerCss(
    await readFile(join(root, 'web/pdf_viewer.css'), 'utf8'),
    scope,
  );
  await writeFile(join(destination, 'text-layer.css'), textLayerCss, 'utf8');
  assets.push({
    file: 'assets/pdfjs/text-layer.css',
    role: 'style',
    source: 'pdfjs-dist/web/pdf_viewer.css',
  });
  return { version: metadata.version, assets, textLayerCss };
}
