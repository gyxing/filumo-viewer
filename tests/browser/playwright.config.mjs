import { defineConfig } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const mode = process.env.FILUMO_LOCAL_SAMPLES === '1' ? 'local' : 'public';
export default defineConfig({
  testDir: './specs',
  testIgnore:
    mode === 'local'
      ? ['**/public.spec.mjs', '**/docs.spec.mjs', '**/smoke.spec.mjs']
      : ['**/performance.spec.mjs', '**/local-smoke.spec.mjs'],
  timeout: 120000,
  expect: { timeout: 30000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  outputDir: resolve(root, 'tmp/testing/' + mode + '/artifacts'),
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: resolve(root, 'tmp/testing/' + mode + '/results.json'),
      },
    ],
  ],
  use: {
    browserName: 'chromium',
    channel: process.env.FILUMO_BROWSER_CHANNEL || undefined,
    launchOptions: {
      executablePath: process.env.FILUMO_BROWSER_EXECUTABLE || undefined,
    },
    headless: true,
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
