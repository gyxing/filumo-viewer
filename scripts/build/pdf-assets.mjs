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
export async function copyPdfAssets(directory, output, scope, options = {}) {
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
  const workerSource = await readFile(
    join(root, 'legacy/build/pdf.worker.mjs'),
    'utf8',
  );
  // 兼容整套外部资源部署，同时让默认发布入口具备包内资源路由。
  await writeFile(
    join(destination, 'legacy/build/pdf.worker.mjs'),
    adaptPdfWorker(workerSource, assets, '../../'),
    'utf8',
  );
  await writeFile(
    join(output, 'worker.js'),
    adaptPdfWorker(workerSource, assets),
    'utf8',
  );
  assets.push({
    file: 'worker.js',
    role: 'worker',
    source: 'pdfjs-dist/legacy/build/pdf.worker.mjs',
  });
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
  const generated = options.source ? output : join(output, 'generated');
  await mkdir(generated, { recursive: true });
  await writeFile(
    join(generated, 'pdf-text-layer.js'),
    '// 自动生成的同版文字层样式，仅在首次挂载文字层时加载。\nexport default ' +
      JSON.stringify(textLayerCss) +
      ';\n',
    'utf8',
  );
  await writeFile(
    join(generated, 'pdf-text-layer.d.ts'),
    'declare const css: string;\nexport default css;\n',
    'utf8',
  );
  assets.push({
    file: options.source ? 'pdf-text-layer.js' : 'generated/pdf-text-layer.js',
    role: 'style',
    source: 'pdfjs-dist/web/pdf_viewer.css',
  });
  return { version: metadata.version, assets, textLayerCss };
}

/** 只替换固定发行模块中已核实的资源入口，版本漂移必须显式失败。 */
function replaceOnce(source, from, to) {
  if (source.split(from).length !== 2)
    throw Error('PDF.js 资源适配入口不唯一：' + from);
  return source.replace(from, to);
}

/** 为同版 Worker 生成可静态分析的资源引用，不劫持全局 fetch 或 XHR。 */
export function adaptPdfWorker(source, assets, assetRoot = './assets/pdfjs/') {
  const binary = assets.filter(
    (asset) =>
      asset.role === 'auxiliary' &&
      !/\.js$|\/LICENSE[^/]*$|quickjs-eval/.test(asset.file),
  );
  const entries = binary.map((asset) => {
    const key = asset.file.slice('assets/pdfjs/'.length);
    return (
      JSON.stringify(key) +
      ': new URL(' +
      JSON.stringify(assetRoot + key) +
      ', import.meta.url).href'
    );
  });
  const prefix = [
    '// Filumo PDF.js 6.4.299 资源适配；上游许可证保留于本文件与资源目录。',
    'const __filumoPdfResources = Object.freeze({' +
      entries.join(',\n') +
      '});',
    'function __filumoResolvePdfResource(url) {',
    "  const bundled = 'filumo-pdf://bundled/';",
    "  const external = 'filumo-pdf://external/';",
    "  if (typeof url !== 'string') return url;",
    '  if (url.startsWith(bundled)) {',
    '    const key = url.slice(bundled.length);',
    '    if (!Object.prototype.hasOwnProperty.call(__filumoPdfResources, key)) throw new Error("缺少包内 PDF 资源：" + key);',
    '    return __filumoPdfResources[key];',
    '  }',
    '  if (url.startsWith(external)) {',
    '    const value = url.slice(external.length), slash = value.indexOf("/");',
    '    const base = new URL(decodeURIComponent(value.slice(0, slash)));',
    '    const file = value.slice(slash + 1), result = new URL(file, base);',
    '    if (!result.pathname.startsWith(base.pathname)) throw new Error("PDF 资源路径越界");',
    '    result.search = base.search;',
    '    return result.href;',
    '  }',
    '  return url;',
    '}',
    'function __filumoImportPdfModule(url) {',
    '  return import(/* webpackIgnore: true */ /* @vite-ignore */ url);',
    '}',
    'function __filumoLoadPdfFallback(base, file) {',
    "  if (base.startsWith('filumo-pdf://bundled/')) {",
    '    switch (file) {',
    '      case "openjpeg_nowasm_fallback.js": return __filumoImportPdfModule(new URL(' +
      JSON.stringify(assetRoot + 'wasm/openjpeg_nowasm_fallback.js') +
      ', import.meta.url).href);',
    '      case "jbig2_nowasm_fallback.js": return __filumoImportPdfModule(new URL(' +
      JSON.stringify(assetRoot + 'wasm/jbig2_nowasm_fallback.js') +
      ', import.meta.url).href);',
    '      default: throw new Error("未知 PDF 解码回退模块：" + file);',
    '    }',
    '  }',
    '  return __filumoImportPdfModule(__filumoResolvePdfResource(base + file));',
    '}',
    '',
  ].join('\n');
  let result = replaceOnce(
    source,
    'async function fetchBinaryData(url) {',
    'async function fetchBinaryData(url) {\n  url = __filumoResolvePdfResource(url);',
  );
  result = replaceOnce(
    result,
    'function fetchSync(url) {',
    'function fetchSync(url) {\n  url = __filumoResolvePdfResource(url);',
  );
  const begin = result.indexOf(
    'const mod = await import(',
    result.indexOf('async #getJsModule('),
  );
  const end = result.indexOf(');', begin);
  if (begin < 0 || end < 0) throw Error('PDF.js 缺少解码回退入口');
  const original = result.slice(begin, end + 2);
  if (
    !original.includes('WasmImage.#wasmUrl') ||
    !original.includes('this._noWasmFilename')
  )
    throw Error('PDF.js 解码回退入口已变化');
  result = replaceOnce(
    result,
    original,
    'const mod = await __filumoLoadPdfFallback(WasmImage.#wasmUrl, this._noWasmFilename);',
  );
  return prefix + result;
}

/** 在既有 generated 边界准备源码资源，不构建组件包或启动服务。 */
export async function preparePdfDefaultAssets(directory, scope) {
  const generated = join(directory, 'src/generated');
  return copyPdfAssets(directory, generated, scope, { source: true });
}

/** 默认资源入口只重写发布路径，Worker 本身仍交给宿主构建器解析。 */
export function pdfEntryAssetsPlugin(directory) {
  return {
    name: 'filumo-pdf-entry-assets',
    setup(builder) {
      builder.onLoad(
        { filter: /[\\/]pdf[\\/]src[\\/]assets\.ts$/ },
        async ({ path }) => {
          if (path !== join(directory, 'src/assets.ts')) return;
          const source = await readFile(path, 'utf8');
          return {
            loader: 'ts',
            contents: replaceOnce(
              source,
              "'./generated/worker.js'",
              "'./worker.js'",
            ),
            resolveDir: dirname(path),
          };
        },
      );
      builder.onResolve(
        { filter: /^\.\/generated\/pdf-text-layer\.js$/ },
        () => ({
          path: './generated/pdf-text-layer.js',
          external: true,
        }),
      );
    },
  };
}
