---
title: 生产部署
description: 生产部署
keywords:
  - Filumo
  - API
siteLayout: docs
toc: content
---

# 生产部署

<div className="filumo-doc-callout" data-kind="deployment">上线前确认生产资源路径与文件来源鉴权。</div>

## Vite 与 Webpack

使用 ESM 入口并保留 Worker 与相对分块结构。PDF 默认接入使用 pdf()，不需要复制 public 资源目录。

```ts | pure
import { defineConfig } from 'vite';
export default defineConfig({ worker: { format: 'es' } });
```

Webpack 5 原生识别 new Worker(new URL(..., import.meta.url))。保留包的 ESM 入口；宿主需要动态资源路径时使用 output.publicPath: 'auto'。不要把输出的 Worker 分块作为普通脚本执行，也不要改写为 CommonJS。只有明确采用外部部署时才参考[图片与 PDF 覆盖配置](./image-pdf)。

## 鉴权与远程文件

```ts | pure
import { createViewer } from '@filumo/dom';
import { pdf } from '@filumo/pdf';
export async function mountPrivatePdf(container: HTMLElement, url: string) {
  const viewer = createViewer(container, {
    plugins: [pdf()],
    height: 640,
    onError: console.error,
  });
  await viewer.open({
    url,
    name: 'report.pdf',
    request: { credentials: 'include' },
  });
  return () => viewer.destroy();
}
```

服务端须允许实际业务域和凭据请求；携带凭据时不能使用通配的 Access-Control-Allow-Origin。返回真实文件字节而非登录 HTML，不在 URL 或日志中放置长期令牌。

## PDF Range 响应

高效远程读取需要真实的 206 与合法 Content-Range。浏览器须能读取响应元数据，可显式暴露 Content-Range、Accept-Ranges、ETag、Last-Modified。首次及后续范围请求均应保留鉴权。不支持 Range 时回退全文；只有 readRange 方法存在不能证明网络流量已优化。

## Markdown 图片与链接

本机 File 没有可自动访问的相邻文件地址，需要明确基址或资源映射。

```ts | pure
import { markdown } from '@filumo/markdown';
const resources = new Map([['./diagram.png', '/api/images/42']]);
const plugin = markdown({
  baseUrl: document.baseURI,
  resolveResource(reference, kind, signal) {
    if (signal.aborted) return undefined;
    return kind === 'image' ? resources.get(reference) : reference;
  },
});
```

回调返回 undefined 会阻止该资源，不自动退回原引用。返回地址仍需通过协议检查；宿主负责授权资源，并在不再使用时释放自行创建的 object URL。

## 样式与 CSP

自动模式可为 style 元素提供宿主 nonce。external 模式需直接安装并导入 DOM 与当前格式的 styles.css，Office 图片弹层另需 Image 样式。动态定位仍使用内联样式属性，需要与宿主 style-src-attr 策略协调；不要为掩盖样式问题而关闭整个站点 CSP。

## 客户端渲染与验收

在客户端创建查看器、打开浏览器 File。React/Next.js 使用客户端组件；Nuxt 可使用 .client.vue 或 ClientOnly。[框架接入](./preview-integration)提供示例，但这些接入配方不等同于所有 SSR 框架及版本都已通过验收。

验收应使用真实生产 base、实际 Worker、带鉴权文件和销毁重开流程。[问题排查](./troubleshooting)按现象给出检查顺序。

## 归档资源与下载

Archive 自带 Worker、固定版本 WASM 和许可。ZIP/TAR/GZIP 不加载 WASM；保留 worker-chunks 与 generated 资源相对结构。只有显式外部部署才配置 `archive({assetsBaseUrl})`。私有大远程原包可用 `ViewerOptions.downloadOriginal(source, signal)` 完全接管默认下载。缓存和完整输入预算不等于浏览器进程内存上限。
