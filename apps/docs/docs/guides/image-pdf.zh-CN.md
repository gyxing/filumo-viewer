---
title: 图片与 PDF 预览
siteLayout: docs
toc: content
---

# 图片与 PDF 预览

图片和 PDF 通过独立插件接入，格式包不依赖 React/Vue。当前为工作区预发布实现，新增能力需要按实际宿主完成验证。

## 接入

```ts | pure
import { createViewer } from '@fivo/dom';
import { image } from '@fivo/image';
import { pdf } from '@fivo/pdf';

const viewer = createViewer(container, {
  height: 640,
  plugins: [
    image(),
    pdf({ assetsBaseUrl: '/fivo-pdf/' }),
  ],
});
await viewer.open(file);
```

React、Vue 和 Vue2 使用相同 plugins，不需要单独的图片或 PDF 框架组件。标准预设也包含两类轻量描述符；引擎、视图和资源在实际打开后加载。

## PDF 静态资产部署

将 `@fivo/pdf/dist/assets/pdfjs/` 的内容按原目录结构部署到站点静态目录，例如 `/fivo-pdf/`，然后传入 assetsBaseUrl。该目录包含同版本 legacy 引擎/Worker、CMap、标准字体、WASM、ICC 和文字层样式；实际打包文件以 build-manifest.json 为准。

直接 ESM 部署可以保留包的相对目录并使用默认地址。Vite、Webpack 等打包宿主应显式复制资产并配置部署地址，不能假定哈希 chunk 的位置与包目录相同。仓库的文档、烟测、示例和消费夹具已经接入对应复制与地址配置。

workerFactory 或 workerSrc 可以替换默认 Worker；工厂优先。引擎与 Worker 必须来自精确一致的 pdfjs-dist 6.4.299。默认不从公共 CDN 请求。资源跨域时还需满足宿主 CORS/CSP。

开发运行和发布前需安装新的 workspace 依赖并更新锁文件；编辑源码不代表已经完成安装或构建。

## 图片

支持 PNG、JPEG/JPG、GIF、WebP、BMP、SVG，AVIF 是否能显示取决于浏览器解码能力。SVG 使用图片上下文，普通图片不先转成 Canvas。

默认适应容器，小图不强制放大；原始尺寸的 100% 使用物理像素比例。支持旋转、复位、拖动和缩放。独立图片使用外壳工具栏，Office 文档中的图片仍使用弹层；两者共用 @fivo/image/view 的交互实现。

Office 继续管理资源租约、转换图和原图下载。独立安装 Office 时公共图片视图是声明过的依赖，不需要宿主反向引入 Office 内部类型。

image({ maxDecodedPixels }) 可限制取得自然尺寸后的像素规模。这不能替代浏览器解码前的严格内存控制；原文件上限使用 resourcePolicy.maxFileBytes。

## PDF 连续阅读

整份文档连续纵向排布，普通滚轮滚动。初始适应宽度，支持页码跳转、大纲、缩略图、查找、旋转和可见页文字选择。缩略图和查找按操作加载，扫描件没有文字时不执行 OCR。

逻辑页面与实际页面 DOM 分离。可见页优先绘制，附近页面预取，远端高清画布按预算回收。混合纸张尺寸、缩放和旋转使用页内锚点保持阅读位置。

默认并发 2，最大 DPR 2，单画布 8,388,608 像素，Canvas 预算 96 MiB，文本缓存估算预算 16 MiB，匹配明细上限 10,000。预算可以通过 PdfOptions 调整。这些值不代表浏览器进程总内存上限，也不是性能验收结果。

## 来源、错误与生命周期

getRangeReader 是 Core 的可选高效区间能力。本地 Blob 使用切片；远程服务器支持实际 206 且提供完整区间元数据时使用分块。原有 readRange 可能回退全文下载，因此方法存在不等于网络流量已优化。

不支持 Range 时回退完整读取，200 探测响应复用，保留来源鉴权和取消。文件内容、总长度或版本变化时要求重新打开。PDF 解析失败不会被 Text 插件接管。

密码 PDF 提供同会话输入与重试；不把密码写入日志。页面局部失败在页内重试，文档级损坏显示格式错误。

离开页面调用 destroy；KeepAlive 使用 setActive 暂停呈现。停用保留当前页和缩放，销毁释放 Worker、画布、文字层、URL、监听及样式租约。

## 验证范围

验证应覆盖当前 Chrome/Edge、目标 Firefox ESR/Safari 版本、非根部署路径和严格 CSP。新增 PDF 的运行时要求需与既有 Office 等格式分开确认；ES2020 编译目标本身不能证明第三方引擎兼容旧浏览器。

工程验证、真实浏览器和复杂扫描件性能以实际执行记录为准。尚未运行的检查不视为通过。
