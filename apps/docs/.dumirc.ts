import { defineConfig } from 'dumi';
import { normalizeDocsBase } from './config/base-path.js';
import { getDocsRoutes } from './config/routes';
const docsBase = normalizeDocsBase(process.env.FILUMO_DOCS_BASE);
const production = process.env.NODE_ENV === 'production';
const smoke = !production && process.env.FILUMO_SMOKE === '1';
export default defineConfig({
  base: docsBase,
  publicPath: docsBase,
  define: { 'process.env.FILUMO_DOCS_BASE': docsBase },
  outputPath: 'dist',
  locales: [
    { id: 'en-US', name: 'English' },
    { id: 'zh-CN', name: '简体中文', base: '/zh-CN' },
  ],
  routes: getDocsRoutes({ production, smoke }),
  plugins: [
    ...(!production ? ['./server/source-dev-plugin.ts'] : []),
    ...(smoke ? ['./server/smoke-plugin.ts'] : []),
  ],
  themeConfig: {
    name: 'Filumo',
    logo: false,
    prefersColor: { default: 'light', switch: false },
    nav: {
      'en-US': [
        { title: 'Home', link: '/' },
        { title: 'Docs', link: '/docs' },
      ],
      'zh-CN': [
        { title: '首页', link: '/zh-CN/' },
        { title: '文档', link: '/zh-CN/docs' },
      ],
    },
    socialLinks: { github: 'https://github.com/gyxing/office-file-viewer' },
  },
  resolve: { docDirs: [] },
});
