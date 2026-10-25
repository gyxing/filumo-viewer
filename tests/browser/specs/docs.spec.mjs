import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import ts from 'typescript';
import { normalizeDocsBase } from '../../../apps/docs/config/base-path.js';
import { createScanPdfFixture } from '../../fixtures/public/image-pdf/node-samples.mjs';
import { isolateNetwork, startServer } from '../helpers.mjs';

/** 对页面实际生成的代码做类型检查，防止只改 UI 却交付不可复制的配置。 */
function exampleDiagnostics(source, kind) {
  const file = resolve(
    'apps/docs/src/__playground-example.' + (kind === 'React' ? 'tsx' : 'ts'),
  );
  const options = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    esModuleInterop: true,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.ReactJSX,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    types: ['react'],
    typeRoots: [resolve('apps/docs/node_modules/@types')],
    baseUrl: process.cwd(),
    paths: { '@filumo/vue': ['packages/vue/dist/index.d.ts'] },
  };
  const text =
    kind === 'React'
      ? source
      : 'declare function defineProps<T>(): T;\n' +
        source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1] +
        '\nconst check: import("@filumo/dom").ViewerConfiguration = options;';
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (path, version, ...rest) =>
    resolve(path) === file
      ? ts.createSourceFile(file, text, version, true)
      : read(path, version, ...rest);
  return ts
    .getPreEmitDiagnostics(ts.createProgram([file], options, host))
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
    );
}

const base = normalizeDocsBase(process.env.FILUMO_DOCS_BASE);
let server;
test.beforeAll(
  async () => (server = await startServer('scripts/testing/serve-docs.mjs')),
);
test.afterAll(async () => server?.close());

test('支持格式包含默认展开的完整清单，两种语言与小屏均可查全', async ({
  page,
}) => {
  await isolateNetwork(page);
  for (const [prefix, title, link] of [
    ['', 'Complete format list', 'View the complete list'],
    ['zh-CN/', '完整格式清单', '查看完整清单'],
  ]) {
    await page.goto(server.url + base + prefix);
    const catalog = page.locator('#format-catalog');
    await page.getByRole('link', { name: link, exact: true }).click();
    await expect(
      catalog.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    await expect(catalog.locator('.filumo-format-catalog-row')).toHaveCount(9);
    // 覆盖此前概览漏写的传统 Office、图片、文本及代码后缀和特殊文件名。
    for (const value of [
      '.docm',
      '.wps',
      '.xltx',
      '.potx',
      '.jpeg',
      '.gif',
      '.bmp',
      '.cfg',
      '.properties',
      '.out',
      '.mjs',
      '.cts',
      '.tsx',
      '.psm1',
      '.gql',
      '.patch',
      'GNUmakefile',
      'CMakeLists.txt',
      '.env.*',
      'Dockerfile.*',
    ])
      await expect(catalog.getByText(value, { exact: true })).toBeVisible();
    await expect(catalog.locator('details, button')).toHaveCount(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#format-catalog')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
});

test('公开文档两种语言、在线示例与隐私隔离', async ({ page, request }) => {
  await isolateNetwork(page);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(server.url + base);
  await expect(page.locator('.office-viewer-site-brand').first()).toBeVisible();
  const linkPaths = await page
    .locator('a[href]')
    .evaluateAll((links) =>
      links
        .map((link) => link.getAttribute('href'))
        .filter((href) => href?.startsWith('/') && !href.startsWith('//')),
    );
  expect(linkPaths.length).toBeGreaterThan(0);
  expect(linkPaths.every((href) => href.startsWith(base))).toBe(true);
  expect(
    (
      await request.get(
        server.url + base + 'assets/filumo-architecture-flow.en-us.svg',
      )
    ).status(),
  ).toBe(200);

  for (const route of ['', 'zh-CN/', 'docs/', 'zh-CN/docs/']) {
    await page.goto(server.url + base + route);
    await expect(
      page.getByText('Filumo', { exact: false }).first(),
    ).toBeVisible();
  }
  await page.goto(server.url + base + 'playground/');
  await page
    .getByLabel('Select a file', { exact: true })
    .setInputFiles('tests/fixtures/public/generated/sample.docx');
  await expect(page.locator('.office-file-docx-viewer')).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator('.filumo-doc-code')).toContainText('@filumo/react');
  expect(
    (await request.get(server.url + base + '__filumo_smoke/samples')).status(),
  ).toBe(404);
  expect(
    (await request.get(server.url + base + 'dev/smoke-test/')).status(),
  ).toBe(404);
  expect(pageErrors).toEqual([]);
});

// 文档完整性必须检查布局与导航，不能以页面出现品牌文字代替。
test('公开文档恢复品牌外壳、目录和开发指南', async ({
  page,
  request,
}, info) => {
  await isolateNetwork(page);
  const guides = [
    ['packages', 'Packages & installation', '包总览与安装'],
    ['image-pdf', 'Images & PDF', '图片与 PDF'],
    [
      'text-formats',
      'Text, JSON, Markdown, CSV, XML & Code',
      '文本与结构化格式',
    ],
    ['preview-integration', 'Framework integration', '框架接入指南'],
    ['compatibility', 'Compatibility & limits', '兼容范围与限制'],
    ['extension-contracts', 'Plugins & future editing', '插件与后续编辑扩展'],
    ['migration', 'Migration to Filumo', '迁移到 Filumo'],
    ['testing', 'Development & testing', '本地开发与测试'],
  ];
  for (const prefix of ['', 'zh-CN/']) {
    await page.goto(server.url + base + prefix + 'docs/');
    await expect(page.locator('.office-viewer-docs')).toBeVisible({
      timeout: 3000,
    });
    await expect(page.locator('.office-viewer-docs__toc')).toBeVisible();
    await expect(
      page.locator('.filumo-doc-navigation').getByRole('treeitem', {
        name: prefix ? /概览与 API/ : /Overview & API/,
      }),
    ).toHaveText(prefix ? '概览与 API' : 'Overview & API');
    await expect(
      page.locator('.office-viewer-docs__article h2'),
    ).not.toHaveCount(0);
    expect(
      await page.locator('.office-viewer-docs__article h2').count(),
    ).toBeGreaterThanOrEqual(6);
    for (const [slug, english, chinese] of guides) {
      const url = base + prefix + 'docs/guides/' + slug;
      await expect(
        page
          .locator('.filumo-doc-navigation')
          .getByText(prefix ? chinese : english, { exact: true }),
      ).toBeVisible();
      expect((await request.get(server.url + url + '/')).status()).toBe(200);
    }
    const apiShortcut = page.locator(
      '.office-viewer-docs__quick-links a[href$="#viewer-options"]',
    );
    await apiShortcut.click({ timeout: 5000 });
    await expect(page).toHaveURL(/#viewer-options$/);
    await expect
      .poll(() =>
        page
          .locator('#viewer-options')
          .evaluate((el) => el.getBoundingClientRect().top),
      )
      .toBeGreaterThanOrEqual(68);
    await expect
      .poll(() =>
        page
          .locator('#viewer-options')
          .evaluate((el) => el.getBoundingClientRect().top),
      )
      .toBeLessThan(140);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await info.attach(prefix ? 'docs-zh' : 'docs-en', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  }
});

test('公开 Playground 恢复两栏工作区与代码操作', async ({ page }, info) => {
  await isolateNetwork(page);
  for (const prefix of ['', 'zh-CN/']) {
    await page.goto(server.url + base + prefix + 'playground/');
    await expect(page.locator('.filumo-playground-workspace')).toBeVisible({
      timeout: 3000,
    });
    await expect(page.locator('.office-viewer-site-header')).toBeVisible();
    const left = await page
      .locator('.filumo-playground-controls')
      .boundingBox();
    const right = await page.locator('.filumo-playground-result').boundingBox();
    expect(right.x).toBeGreaterThan(left.x + left.width);
    const tabs = page.getByRole('tablist', {
      name: prefix ? '示例代码' : 'Example code',
    });
    for (const [name, pkg] of [
      ['React', '@filumo/react'],
      ['Vue 3', '@filumo/vue'],
      ['Vue 2', '@filumo/vue2'],
      ['JavaScript', '@filumo/dom'],
    ]) {
      await tabs.getByRole('tab', { name, exact: true }).click();
      await expect(page.locator('.filumo-doc-code')).toContainText(pkg);
      if (name === 'React' || name === 'Vue 3')
        expect(
          exampleDiagnostics(
            await page.locator('.filumo-doc-code').innerText(),
            name,
          ),
        ).toEqual([]);
    }
    const copyButton = page.getByRole('button', {
      name: prefix ? '复制代码' : 'Copy code',
      exact: true,
    });
    await expect(copyButton).toBeVisible();
    await copyButton.click();
    await expect(
      page.getByRole('button', {
        name: prefix ? '已复制' : 'Copied',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('spinbutton', {
        name: prefix ? '预览高度' : 'Preview height',
        exact: true,
      })
      .fill('720');
    await page
      .getByRole('spinbutton', {
        name: prefix ? '预览高度' : 'Preview height',
        exact: true,
      })
      .press('Tab');
    await expect(page.locator('.filumo-doc-code')).toContainText('720');
    await page
      .getByRole('button', {
        name: prefix ? '恢复默认' : 'Reset defaults',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('spinbutton', {
        name: prefix ? '预览高度' : 'Preview height',
        exact: true,
      }),
    ).toHaveValue('640');
    await info.attach(prefix ? 'playground-zh' : 'playground-en', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  }
});

test('公开文档指南可导航、语言切换保留页面，窄屏不横向溢出', async ({
  page,
}, info) => {
  await isolateNetwork(page);
  await page.goto(server.url + base + 'docs/guides/preview-integration/');
  await expect(page.locator('.office-viewer-docs__article')).toContainText(
    'Vue 2.6 / 2.7',
  );
  await expect(page.locator('.office-viewer-site-language')).toHaveAttribute(
    'href',
    base + 'zh-CN/docs/guides/preview-integration',
  );
  await page.locator('.office-viewer-site-language').click();
  await expect(page.locator('.office-viewer-docs__article h1')).toHaveText(
    '框架接入指南',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.office-viewer-docs__toc-trigger')).toBeVisible();
  await page.locator('.office-viewer-docs__toc-trigger').click();
  await expect(page.locator('.office-viewer-docs__toc')).toHaveAttribute(
    'aria-modal',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(page.locator('.office-viewer-docs__toc-trigger')).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await info.attach('docs-mobile', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.goto(server.url + base + 'zh-CN/playground/');
  await expect(page.locator('.filumo-playground-controls')).toBeVisible();
  const controls = await page
    .locator('.filumo-playground-controls')
    .boundingBox();
  const result = await page.locator('.filumo-playground-result').boundingBox();
  expect(result.y).toBeGreaterThanOrEqual(controls.y + controls.height);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await info.attach('playground-mobile', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('公开体验覆盖文本与结构化格式，代码保留完整插件和部署地址', async ({
  page,
}) => {
  await isolateNetwork(page);
  await page.goto(server.url + base + 'playground/');
  for (const [name, mimeType, content, selector] of [
    ['sample.txt', 'text/plain', 'line one\nline two', '.filumo-text-viewport'],
    [
      'sample.json',
      'application/json',
      '{"name":"Filumo","count":2}',
      '.filumo-json-workspace',
    ],
    [
      'sample.md',
      'text/markdown',
      '# Filumo\n\ncontent',
      '.filumo-markdown-reading',
    ],
    [
      'sample.xml',
      'application/xml',
      '<root><name>Filumo</name></root>',
      '.filumo-xml-workspace',
    ],
    ['sample.csv', 'text/csv', 'name,value\nFilumo,2', '.filumo-csv-grid'],
    [
      'sample.ts',
      'text/plain',
      'const message: string = "Filumo";',
      '.filumo-text-viewport',
    ],
    [
      'sample.svg',
      'image/svg+xml',
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="blue"/></svg>',
      '.filumo-image-surface',
    ],
  ]) {
    await page.getByLabel('Select a file', { exact: true }).setInputFiles({
      name,
      mimeType,
      buffer: Buffer.from(content),
    });
    await expect(page.locator(selector).first()).toBeVisible({
      timeout: 30000,
    });
    await expect(page.locator('.filumo-playground-file-info')).toContainText(
      name,
    );
    if (name.endsWith('.ts'))
      await expect(page.locator('.filumo-reading-scope').first()).toHaveClass(
        /filumo-code/,
      );
  }
  await page.getByLabel('Select a file', { exact: true }).setInputFiles({
    name: 'sample.pdf',
    mimeType: 'application/pdf',
    buffer: createScanPdfFixture(),
  });
  await expect(page.locator('.filumo-pdf-viewport')).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator('.filumo-pdf-canvas').first()).toBeVisible({
    timeout: 30000,
  });
  const source = page.locator('.filumo-doc-code');
  for (const factory of [
    'office',
    'text',
    'json',
    'markdown',
    'image',
    'pdf',
    'csv',
    'xml',
    'code',
  ])
    await expect(source).toContainText(factory + '(');
  await expect(source).toContainText('pdf()');
  await expect(source).not.toContainText('assetsBaseUrl');
  await expect(page.locator('.filumo-playground-controls')).toContainText(
    'Office-specific settings',
  );
});

test('公开包总览保持中英文十五包，语言切换保留当前指南', async ({ page }) => {
  await isolateNetwork(page);
  for (const prefix of ['', 'zh-CN/']) {
    await page.goto(server.url + base + prefix + 'docs/guides/packages/');
    const catalogue = page
      .locator('.office-viewer-docs__article table')
      .first();
    await expect(catalogue.locator('tbody tr')).toHaveCount(15);
    for (const name of [
      'core',
      'dom',
      'viewer',
      'office',
      'pdf',
      'image',
      'text',
      'json',
      'markdown',
      'csv',
      'xml',
      'code',
      'react',
      'vue',
      'vue2',
    ])
      await expect(
        catalogue.getByRole('link', { name: '@filumo/' + name, exact: true }),
      ).toHaveAttribute(
        'href',
        'https://www.npmjs.com/package/@filumo/' + name,
      );
    await expect(page.locator('.office-viewer-site-language')).toHaveAttribute(
      'href',
      base + (prefix ? '' : 'zh-CN/') + 'docs/guides/packages',
    );
  }
});

test('文档目录使用原生 Tree 标题、展开图标与选中状态', async ({ page }) => {
  await page.goto(server.url + base + 'docs/guides/viewer-api/');
  const nav = page.locator('.filumo-doc-navigation');
  await expect(nav.getByRole('tree')).toHaveCount(1);
  await expect(nav.getByRole('link')).toHaveCount(0);
  await expect(page.locator('.dumi-default-toc')).toHaveCount(0);
  const overview = nav.getByRole('treeitem', { name: /Viewer API/ });
  await expect(overview.getByText('Viewer API', { exact: true })).toBeVisible();
  await expect(
    overview.getByRole('img', { name: 'minus-square' }),
  ).toBeVisible();
  await expect(overview).toHaveAttribute('aria-expanded', 'true');
  await overview.getByText('Viewer API', { exact: true }).click();
  await expect(overview).toHaveAttribute('aria-expanded', 'true');

  const section = nav.getByRole('treeitem', {
    name: /Component props and configuration/,
  });
  await section
    .getByText('Component props and configuration', { exact: true })
    .click();
  await expect(section).toHaveClass(/ant-tree-treenode-selected/);
  await section.getByRole('img', { name: 'plus-square' }).click();
  await expect(section).toHaveAttribute('aria-expanded', 'true');
  const viewOptions = nav.getByRole('treeitem', { name: /^ViewOptions$/ });
  await viewOptions.getByText('ViewOptions', { exact: true }).click();
  await expect(viewOptions).toHaveClass(/ant-tree-treenode-selected/);

  await overview.getByRole('img', { name: 'minus-square' }).click();
  await expect(overview).toHaveAttribute('aria-expanded', 'false');
  await expect(
    overview.getByRole('img', { name: 'plus-square' }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollBy(0, 12));
  await expect(overview).toHaveAttribute('aria-expanded', 'false');
});

test('原生目录手动滚动后，正文在同一节内滚动不会把目录拉回', async ({
  page,
}) => {
  await page.goto(server.url + base + 'docs/guides/viewer-api/');
  const nav = page.locator('.filumo-doc-navigation');
  const section = nav.getByRole('treeitem', {
    name: /Component props and configuration/,
  });
  await section
    .getByText('Component props and configuration', { exact: true })
    .click();
  await expect(section).toHaveClass(/ant-tree-treenode-selected/);
  const top = await nav.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
    return node.scrollTop;
  });
  await page.evaluate(() => window.scrollBy(0, 12));
  await expect(section).toHaveClass(/ant-tree-treenode-selected/);
  await expect.poll(() => nav.evaluate((node) => node.scrollTop)).toBe(top);
});

test('所有有章节的一级文档都有原生展开图标，展开不切页，章节跨文档定位', async ({
  page,
}) => {
  await page.goto(server.url + base + 'docs/');
  const nav = page.locator('.filumo-doc-navigation');
  for (const title of [
    'Packages & installation',
    'Images & PDF',
    'Text, JSON, Markdown, CSV, XML & Code',
    'Framework integration',
    'Compatibility & limits',
    'Plugins & future editing',
    'Migration to Filumo',
    'Development & testing',
  ]) {
    const root = nav.getByRole('treeitem').filter({
      has: page.getByText(title, { exact: true }),
    });
    await expect(root).toHaveAttribute('aria-expanded', 'false');
    await expect(root.getByRole('img', { name: 'plus-square' })).toBeVisible();
  }

  const catalogue = nav.getByRole('treeitem').filter({
    has: page.getByText('Packages & installation', { exact: true }),
  });
  const original = page.url();
  await catalogue.getByRole('img', { name: 'plus-square' }).click();
  await expect(catalogue).toHaveAttribute('aria-expanded', 'true');
  await expect(page).toHaveURL(original);
  await nav.getByText('Package catalogue', { exact: true }).click();
  await expect(page).toHaveURL(
    /\/docs\/guides\/packages\/?#package-catalogue$/,
  );
  await expect(
    page.getByRole('heading', {
      name: 'Packages and installation',
      exact: true,
    }),
  ).toBeVisible();
  await expect(catalogue).toHaveAttribute('aria-expanded', 'true');
});

test('桌面文档目录固定在导航下方，正文滚到底部仍保持位置和独立滚动', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(server.url + base + 'docs/');
  const sidebar = page.locator('.office-viewer-docs__toc');
  await expect(sidebar).toHaveCSS('position', 'fixed');
  const before = await sidebar.boundingBox();
  expect(before).not.toBeNull();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(100);
  await expect.poll(async () => (await sidebar.boundingBox()).y).toBe(before.y);
  await expect(
    sidebar.locator('.office-viewer-docs__toc-heading'),
  ).toBeVisible();
  const after = await sidebar.boundingBox();
  expect(after.x).toBe(before.x);
  expect(after.width).toBe(240);
  expect(after.y + after.height).toBeLessThanOrEqual(900 - 24);
  const bodyTop = await page.evaluate(() => window.scrollY);
  await page.locator('.filumo-doc-navigation').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  expect(await page.evaluate(() => window.scrollY)).toBe(bodyTop);
});

test('固定目录的小屏抽屉按视口收窄，并为关闭遮罩留出空间', async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(server.url + base + 'zh-CN/docs/');
    const trigger = page.getByRole('button', { name: '文档目录', exact: true });
    await trigger.click();
    const drawer = page.locator('.office-viewer-docs__toc');
    await expect(drawer).toHaveAttribute('aria-modal', 'true');
    await expect
      .poll(async () => (await drawer.boundingBox()).width)
      .toBe(Math.min(320, width - 32));
    await expect.poll(async () => (await drawer.boundingBox()).x).toBe(0);
    await expect(drawer).toHaveCSS('top', '64px');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  }
});

test('公开 PDF 默认接入不依赖旧 public 资源目录或外部 CDN', async ({
  page,
}) => {
  await isolateNetwork(page);
  await page.goto(server.url + base + 'playground/');
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.getByLabel('Select a file', { exact: true }).setInputFiles({
    name: 'bundled.pdf',
    mimeType: 'application/pdf',
    buffer: createScanPdfFixture(),
  });
  await expect(page.locator('.filumo-pdf-canvas').first()).toBeVisible({
    timeout: 30000,
  });
  expect(requests.some((url) => url.includes('/filumo-assets/pdf/'))).toBe(
    false,
  );
  expect(
    requests.every(
      (url) =>
        new URL(url).origin === new URL(server.url).origin ||
        url.startsWith('blob:') ||
        url.startsWith('data:'),
    ),
  ).toBe(true);
});

test('文档搜索按操作加载并可关闭，双语锚点、页脚与 SEO 保持一致', async ({
  page,
}) => {
  await isolateNetwork(page);
  await page.goto(server.url + base + 'docs/guides/viewer-api/#viewer-options');
  await expect(page.locator('.office-viewer-site-language')).toHaveAttribute(
    'href',
    base + 'zh-CN/docs/guides/viewer-api#viewer-options',
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://gyxing.github.io' + base + 'docs/guides/viewer-api',
  );
  const trigger = page.getByRole('button', {
    name: 'Search documentation',
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole('dialog', {
    name: 'Search documentation',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('textbox', { name: 'Search keywords' })
    .fill('workerFactory');
  await expect(
    dialog.locator('.filumo-doc-search-results li').first(),
  ).toBeVisible();
  await dialog
    .getByRole('textbox', { name: 'Search keywords' })
    .press('ArrowDown');
  await expect(
    dialog.locator('.filumo-doc-search-results a').first(),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.goto(server.url + base + 'zh-CN/docs/');
  await expect(
    page.locator('.office-viewer-site-footer .office-viewer-site-brand'),
  ).toHaveAttribute('href', base + 'zh-CN/');
  await expect(
    page.getByRole('navigation', { name: '文档上下篇' }),
  ).toBeVisible();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  }
});
