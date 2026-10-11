import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import ts from 'typescript';
import { normalizeDocsBase } from '../../../apps/docs/config/base-path.js';
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
    paths: { '@fivo/vue': ['packages/vue/dist/index.d.ts'] },
  };
  const text =
    kind === 'React'
      ? source
      : 'declare function defineProps<T>(): T;\n' +
        source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1] +
        '\nconst check: import("@fivo/dom").ViewerConfiguration = options;';
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

const base = normalizeDocsBase(process.env.FIVO_DOCS_BASE);
let server;
test.beforeAll(
  async () => (server = await startServer('scripts/testing/serve-docs.mjs')),
);
test.afterAll(async () => server?.close());
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
        server.url + base + 'assets/fivo-architecture-flow.en-us.svg',
      )
    ).status(),
  ).toBe(200);

  for (const route of ['', 'zh-CN/', 'docs/', 'zh-CN/docs/']) {
    await page.goto(server.url + base + route);
    await expect(
      page.getByText('Fivo', { exact: false }).first(),
    ).toBeVisible();
  }
  await page.goto(server.url + base + 'playground/');
  await page
    .getByLabel('Select an Office file', { exact: true })
    .setInputFiles('tests/fixtures/public/generated/sample.docx');
  await expect(page.locator('.office-file-docx-viewer')).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator('.fivo-doc-code')).toContainText('@fivo/react');
  expect(
    (await request.get(server.url + base + '__fivo_smoke/samples')).status(),
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
    'preview-integration',
    'compatibility',
    'extension-contracts',
    'migration',
    'testing',
  ];
  for (const prefix of ['', 'zh-CN/']) {
    await page.goto(server.url + base + prefix + 'docs/');
    await expect(page.locator('.office-viewer-docs')).toBeVisible({
      timeout: 3000,
    });
    await expect(page.locator('.office-viewer-docs__toc')).toBeVisible();
    await expect(
      page.locator('.fivo-doc-navigation a[aria-current="page"]'),
    ).toHaveText(prefix ? '概览与 API' : 'Overview & API');
    await expect(
      page.locator('.office-viewer-docs__article h2'),
    ).not.toHaveCount(0);
    expect(
      await page.locator('.office-viewer-docs__article h2').count(),
    ).toBeGreaterThanOrEqual(12);
    for (const slug of guides) {
      const url = base + prefix + 'docs/guides/' + slug;
      await expect(
        page.locator('.fivo-doc-navigation a[href="' + url + '"]'),
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
    await expect(page.locator('.fivo-playground-workspace')).toBeVisible({
      timeout: 3000,
    });
    await expect(page.locator('.office-viewer-site-header')).toBeVisible();
    const left = await page.locator('.fivo-playground-controls').boundingBox();
    const right = await page.locator('.fivo-playground-result').boundingBox();
    expect(right.x).toBeGreaterThan(left.x + left.width);
    const tabs = page.getByRole('tablist', {
      name: prefix ? '示例代码' : 'Example code',
    });
    for (const [name, pkg] of [
      ['React', '@fivo/react'],
      ['Vue 3', '@fivo/vue'],
      ['Vue 2', '@fivo/vue2'],
      ['JavaScript', '@fivo/dom'],
    ]) {
      await tabs.getByRole('tab', { name, exact: true }).click();
      await expect(page.locator('.fivo-doc-code')).toContainText(pkg);
      if (name === 'React' || name === 'Vue 3')
        expect(
          exampleDiagnostics(
            await page.locator('.fivo-doc-code').innerText(),
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
    await expect(page.locator('.fivo-doc-code')).toContainText('720');
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
  await expect(page.locator('.fivo-playground-controls')).toBeVisible();
  const controls = await page
    .locator('.fivo-playground-controls')
    .boundingBox();
  const result = await page.locator('.fivo-playground-result').boundingBox();
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
