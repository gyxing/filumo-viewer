---
title: 图片与 PDF 预览
description: Filumo 图片预览与 PDF 连续阅读、侧栏、同版资源部署及内存预算。
keywords:
  - Filumo
  - file preview
  - document viewer
  - 文件预览
siteLayout: docs
toc: content
---

# 图片与 PDF 预览

图片和 PDF 通过独立插件接入，格式包不依赖 React/Vue。应按目标宿主选择兼容版本并验证新增能力。

## 接入

```ts | pure
import { createViewer } from '@filumo/dom';
import { image } from '@filumo/image';
import { pdf } from '@filumo/pdf';

const viewer = createViewer(container, {
  height: 640,
  plugins: [image(), pdf()],
});
await viewer.open(file);
```

React、Vue 和 Vue2 使用相同 plugins，不需要单独的图片或 PDF 框架组件。标准预设也包含两类轻量描述符；引擎、视图和资源在实际打开后加载。

## 默认资源与宿主覆盖

普通接入使用 `pdf()`。默认引擎通过模块动态导入加载，Worker 使用包内的 `new Worker(new URL(..., import.meta.url))` 入口；CMap、标准字体、WASM、ICC 和解码回退文件由同版资源清单定位，默认文字层样式来自延迟加载模块。宿主不需要为默认配置手工复制整套静态目录。

注册插件不创建 Worker，也不下载全部辅助资源。资源进入构建输出不等于首屏全部请求，具体字体、字符映射与解码数据仍在 PDF 内容需要时读取。默认不访问公共 CDN，也不会在失败后偷偷切换 CDN。

| 配置项                    | 缺省行为                 | 宿主覆盖                                                                     |
| ------------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| assetsBaseUrl             | 使用包内集成             | 指定整套同版资源根目录，保留外部引擎、Worker、辅助资源和文字层样式的部署方式 |
| cMapUrl                   | 包内压缩 CMap            | 覆盖 CMap 目录，保持 cMapPacked: true 对应的 bcmap 格式                      |
| standardFontDataUrl       | 包内标准字体             | 覆盖标准字体目录                                                             |
| wasmUrl                   | 包内 WASM 与对应 JS 回退 | 覆盖解码资源目录，应包含匹配的回退脚本                                       |
| iccUrl                    | 包内 ICC                 | 覆盖色彩配置目录                                                             |
| workerSrc / workerFactory | 包内适配 Worker          | 自定义 Worker 地址或创建方式，工厂优先                                       |
| useWasm                   | true                     | false 明确停用 WASM，使用可用的 JavaScript 图像解码回退                      |

资源优先级为：**单项目录 > assetsBaseUrl 对应子目录 > 包内默认资源**。不传 URL 不表示禁用；空白字符串、非法协议或非布尔 useWasm 会明确报错。相对覆盖地址按宿主页面 baseURI 解析，目录补齐末尾斜杠。

```ts | pure
const plugins = [
  pdf({
    cMapUrl: '/custom-pdf/cmaps/',
    standardFontDataUrl: '/custom-pdf/fonts/',
    wasmUrl: '/custom-pdf/wasm/',
    iccUrl: '/custom-pdf/iccs/',
    useWasm: true,
  }),
];
```

以上均为可选覆盖项。只需要修改其中一项时，其余类别继续使用默认资源。

## 高级：整套外部资源部署

只有宿主明确选择独立资源目录时，才将 `@filumo/pdf/dist/assets/pdfjs/` 的内容保留原结构复制到公开目录，再配置 `pdf({ assetsBaseUrl: '/filumo-pdf/' })`。不要只复制一个 Worker。目录包括引擎、Worker、CMap、字体、WASM、ICC、文字层 CSS、LICENSE 和 NOTICE。

引擎、Worker、辅助文件及解码回退脚本必须与固定的 pdfjs-dist 6.4.299 一致。自定义 CDN 由宿主显式指定，须满足 CORS/CSP；跨域 Worker 还需要符合浏览器的 Worker 来源限制。目录查询参数需要本包的适配 Worker 才能正确还原。直接使用原生 PDF.js Worker 时，宿主须提供它能访问的完整普通资源目录，不能让它解析包内虚拟资源标识。

文档站、烟测和默认示例使用相同的包内资源链路，不再依赖 public/filumo-assets/pdf 复制作为默认兜底。FILUMO_DOCS_BASE 继续控制站点子目录，资源最终地址由构建器处理。

默认集成的实际兼容范围需以发布产物在 Vite 开发/生产、Webpack/dumi 和非根部署中的执行记录为准；以对应提交的验证矩阵为准，不外推到未经测试的宿主。

## 图片

支持 PNG、JPEG/JPG、GIF、WebP、BMP、SVG，AVIF 是否能显示取决于浏览器解码能力。SVG 使用图片上下文，普通图片不先转成 Canvas。

默认适应容器，小图不强制放大；原始尺寸的 100% 使用物理像素比例。支持旋转、复位、拖动和缩放。独立图片使用外壳工具栏，Office 文档中的图片仍使用弹层；两者共用 @filumo/image/view 的交互实现。

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
