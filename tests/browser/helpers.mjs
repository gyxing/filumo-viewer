import { expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** 只启动本仓测试服务，动态端口避免与用户已有服务冲突。 */
export async function startServer(script, args = []) {
  const child = spawn(process.execPath, [resolve(root, script), ...args], {
    cwd: root,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let log = '';
  const url = await new Promise((resolveUrl, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('测试服务启动超时：' + log.slice(-2000)));
    }, 60000);
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error('测试服务退出：' + code + '\n' + log.slice(-2000)));
    });
    const receive = (chunk) => {
      log += String(chunk);
      const match = log.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        clearTimeout(timeout);
        resolveUrl(match[0]);
      }
    };
    child.stdout.on('data', receive);
    child.stderr.on('data', receive);
  });
  return {
    url,
    async close() {
      if (child.exitCode !== null) return;
      await new Promise((resolveClose) => {
        child.once('exit', resolveClose);
        child.kill();
      });
    },
  };
}

/** 样本仅访问本机静态资源，不执行文档中的外部网络请求。 */
export async function isolateNetwork(page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ||
      ['data:', 'blob:'].includes(url.protocol)
      ? route.continue()
      : route.abort('blockedbyclient');
  });
}

/** 将页面实际断言保存为附件，失败时保留原结果而非手工重写结论。 */
export async function runChecks(
  page,
  url,
  testInfo,
  button = '#run',
  result = '#result',
) {
  await isolateNetwork(page);
  await page.goto(url);
  await page.locator(button).click();
  await expect(page.locator('body')).toHaveAttribute(
    'data-verification',
    /passed|failed/,
    { timeout: 90000 },
  );
  const text = await page.locator(result).textContent();
  await testInfo.attach('page-checks', {
    body: text ?? '',
    contentType: 'text/plain',
  });
  expect(
    await page.locator('body').getAttribute('data-verification'),
    text ?? '',
  ).toBe('passed');
}
