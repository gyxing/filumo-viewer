import { expect, test } from '@playwright/test';
import { startServer } from '../helpers.mjs';
let server;
test.beforeAll(async () => {
  server = await startServer('scripts/testing/serve-demo.mjs', [
    '--framework',
    'vanilla',
    '--port',
    '0',
  ]);
});
test.afterAll(async () => server?.close());

test('GIF 使用原生图片，窄容器和停用恢复不产生第二套画布', async ({ page }) => {
  await page.goto(server.url + '/image-pdf.html');
  await page.getByRole('button', { name: 'gif', exact: true }).click();
  await expect(page.locator('.fivo-image-surface > img')).toBeVisible();
  expect(await page.locator('#image-pdf-host canvas').count()).toBe(0);
  await page.evaluate(() => {
    document.getElementById('image-pdf-host').style.width = '320px';
    window.fivoImagePdf.update({ theme: 'dark' });
    window.fivoImagePdf.setActive(false);
  });
  await expect(page.locator('.fivo-image-scope')).toBeHidden();
  await page.evaluate(() => window.fivoImagePdf.setActive(true));
  await expect(page.locator('.fivo-image-surface > img')).toBeVisible();
  await expect(
    page.locator('.fivo-controls-main').getByRole('button', { name: '复位', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '更多操作', exact: true }),
  ).toBeHidden();
});
test('图片原生显示、标题后缀、旋转和复位不加载 Office 或 PDF 引擎', async ({
  page,
}) => {
  const seen = [];
  page.on('request', (request) => seen.push(request.url()));
  await page.goto(server.url + '/image-pdf.html');
  await page.getByRole('button', { name: 'image', exact: true }).click();
  await expect(page.locator('.fivo-image-surface > img')).toBeVisible();
  await expect(page.locator('.fivo-title')).toHaveText('example.svg');
  const main = page.locator('.fivo-controls-main');
  for (const name of ['适应容器', '原始尺寸', '旋转', '复位'])
    await expect(main.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '更多操作', exact: true }),
  ).toBeHidden();
  await page.getByRole('button', { name: '旋转', exact: true }).click();
  await expect(page.locator('.fivo-image-surface > img')).toHaveAttribute(
    'style',
    /rotate\(90deg\)/,
  );
  expect(seen.some((url) => url.includes('/assets/pdf/'))).toBe(false);
  await main.getByRole('button', { name: '复位', exact: true }).click();
  await expect(page.locator('.fivo-image-surface > img')).toHaveAttribute(
    'style',
    /rotate\(0deg\)/,
  );
  await page.evaluate(() => window.fivoImagePdf.dispose());
  await expect(page.locator('.fivo-viewer')).toHaveCount(0);
  await expect(page.locator('style[data-fivo-style^="image:"]')).toHaveCount(0);
});
