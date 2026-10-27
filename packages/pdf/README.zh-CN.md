# @filumo/pdf

<p>
<a href="https://github.com/gyxing/filumo-viewer/blob/master/packages/pdf/README.md">English</a> | <strong>简体中文</strong> ·
<a href="https://gyxing.github.io/filumo-viewer/playground" target="_blank" rel="noopener noreferrer">在线示例</a> ·
<a href="https://gyxing.github.io/filumo-viewer/docs" target="_blank" rel="noopener noreferrer">对接文档</a>
</p>

基于固定版本 PDF.js 的只读 PDF 连续阅读插件。滚轮连续浏览页面，页面 DOM、Canvas、文字层和缩略图按窗口管理。

本文档对应 **0.1.0**。以下命令展示 npm 发布后的消费方式；从当前源码工作区使用时，请先按接入指南构建各包。

## 主要能力

- 提供连续滚动、大纲定位与跟随、缩略图、文本查找、页码导航和旋转。
- 根入口仅注册描述符；引擎与 Worker 在真正打开 PDF 时加载。
- 自带同版本资源的地址解析入口，不默认使用外部 CDN；内存预算只约束查看器自身管理的资源。

## 安装

```sh
pnpm add @filumo/dom @filumo/pdf
# 或使用 npm
npm install @filumo/dom @filumo/pdf
```

## 最小接入

```html
<div id="viewer"></div>
<button id="dispose" type="button">关闭预览</button>
```

```ts
import { createViewer } from '@filumo/dom';
import { pdf } from '@filumo/pdf';

const container = document.getElementById('viewer');
if (!container) throw new Error('缺少预览容器');

const viewer = createViewer(container, {
  plugins: [pdf()],
  height: 640,
  locale: 'zh-CN',
  resourcePolicy: { maxFileBytes: 20 * 1024 * 1024 },
  onError: (error) => console.error(error),
});

try {
  await viewer.open('/files/example.pdf');
} catch (error) {
  console.error(error);
}

document.getElementById('dispose')?.addEventListener('click', () => {
  void viewer.destroy();
});
window.addEventListener(
  'pagehide',
  () => {
    void viewer.destroy();
  },
  { once: true },
);
```

将示例 URL 换成真实可访问的文件地址，或在文件选择事件中传入 File。20 MiB 等示例限制是宿主配置，不是库默认限制；关闭时由句柄释放会话、资源与样式租约。

## 常用配置

| 配置项                      | 默认值               | 说明                                                       |
| --------------------------- | -------------------- | ---------------------------------------------------------- |
| `assetsBaseUrl`             | 包内默认资源集成     | 可选的整套外部资源根目录；普通接入不需要填写。             |
| `cMapUrl`                   | 包内压缩 CMap        | 可选覆盖字符映射目录。                                     |
| `standardFontDataUrl`       | 包内标准字体         | 可选覆盖字体目录。                                         |
| `wasmUrl`                   | 包内 WASM 与 JS 回退 | 可选覆盖解码资源目录。                                     |
| `iccUrl`                    | 包内 ICC             | 可选覆盖色彩配置目录。                                     |
| `useWasm`                   | true                 | false 明确关闭 WASM，保留可用的 JS 图像解码回退。          |
| `workerSrc / workerFactory` | 内置模块 Worker 地址 | 覆盖 Worker 路径或创建器；必须与当前 PDF.js 引擎版本一致。 |
| `renderConcurrency`         | 2                    | 页面绘制并发数。                                           |
| `maxDpr`                    | 2                    | Canvas 绘制使用的设备像素比上限。                          |
| `maxCanvasPixels`           | 8,388,608            | 单张 Canvas 像素预算。                                     |
| `canvasCacheBytes`          | 96 MiB               | 当前查看器管理的 Canvas 缓存预算。                         |
| `textCacheBytes`            | 16 MiB               | 文本缓存的估算预算。                                       |
| `maxSearchMatches`          | 10,000               | 保留的查找命中数量上限。                                   |
| `onHyperlinkActivate`       | 未设置               | 外部链接回调，参数为 URL 字符串。                          |

完整类型以公开声明与源码为准；没有列出的功能不能通过猜测选项名开启。

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

```ts
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

默认集成的实际兼容范围需以发布产物在 Vite 开发/生产、Webpack/dumi 和非根部署中的执行记录为准；源码改动本身不代表宿主接入已通过验证，请查看对应版本的验证记录。

## 阅读和性能边界

Canvas、文字层、缩略图与页面 DOM 按窗口管理，不一次保留全部位图。缓存预算不等于进程总内存限制，PDF 引擎和浏览器开销另计。扫描 PDF 可显示图像，但缺少文字的页面不能凭空检索；没有 OCR、编辑或格式转换。加密文件需要有效密码，具体支持取决于引擎和文档。

## 样式与运行环境

默认 auto 模式随实际视图加载样式，通常不需要手动导入 CSS。若宿主选择 `stylePolicy: { mode: 'external' }`，在创建查看器前加载匹配版本的外部样式：

```ts
import '@filumo/dom/styles.css';
import '@filumo/pdf/styles.css';
```

external 样式模式只改变 CSS 提供方式，PDF 的默认引擎与辅助资源集成仍然有效；选择 assetsBaseUrl 外部部署时才需要复制整套资源。

字符串输入表示 URL，不表示文件正文；直接文本内容请使用 File/Blob。支持的来源还包括 Uint8Array、带 name/mimeType/request 的 URL 对象和自定义 DocumentSource 工厂。远程文件和辅助资源需要满足宿主的网络、CORS 与 CSP 配置。

包以 ESM 发布，包含 TypeScript 声明；不提供 CommonJS require 入口。查看器挂载、图片解码和文件选择在浏览器执行；导入轻量入口不等于支持在服务端渲染文件。宿主应在客户端生命周期创建实例，并在不再使用时销毁。

## 公开入口

| 公开入口                 | 用途                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `@filumo/pdf`            | pdf 工厂及公开配置类型                                                                            |
| `@filumo/pdf/styles.css` | 预编译外部样式资源，用于 external 样式模式                                                        |
| `@filumo/pdf/assets`     | resolvePdfAssets 地址解析、createPdfWorker 创建器及 PdfAssetLocations 类型；单纯导入不创建 Worker |
| `@filumo/pdf/worker.js`  | 模块 Worker 资源；部署时保留相关分块，不作为普通函数导入                                          |
| `@filumo/pdf/assets/*`   | PDF.js 发行资产子路径，供构建复制和部署                                                           |

未列出的包内路径不是稳定公共 API。独立格式不依赖 React/Vue 适配层，宿主只安装实际需要的格式和适配包。

## Filumo 包清单

当前包已加粗。每个包独立发布，包名链接到 npm，源码链接指向项目实际仓库。

<!-- filumo-packages:start -->

| 包（点击进入 npm）                                                 | 用途                                         | 源码说明                                                                                        |
| ------------------------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [@filumo/core](https://www.npmjs.com/package/@filumo/core)         | 无 UI 的来源、插件协议、会话和公共文本处理   | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/core/README.zh-CN.md)     |
| [@filumo/dom](https://www.npmjs.com/package/@filumo/dom)           | 原生 DOM 查看器、工具栏、原文、大纲和共享 UI | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/dom/README.zh-CN.md)      |
| [@filumo/viewer](https://www.npmjs.com/package/@filumo/viewer)     | 十类格式插件的标准预设与工厂聚合             | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/viewer/README.zh-CN.md)   |
| [@filumo/office](https://www.npmjs.com/package/@filumo/office)     | Word、Excel、PowerPoint 与受支持的旧格式     | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/office/README.zh-CN.md)   |
| **[@filumo/pdf](https://www.npmjs.com/package/@filumo/pdf)**       | PDF 连续阅读、大纲、缩略图和查找             | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/pdf/README.zh-CN.md)      |
| [@filumo/image](https://www.npmjs.com/package/@filumo/image)       | 图片预览、缩放、旋转、拖动及共享弹层         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/image/README.zh-CN.md)    |
| [@filumo/text](https://www.npmjs.com/package/@filumo/text)         | 纯文本、日志、编码识别与可读文本兜底         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/text/README.zh-CN.md)     |
| [@filumo/json](https://www.npmjs.com/package/@filumo/json)         | JSON / JSONC / JSONL / NDJSON 原文与结构     | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/json/README.zh-CN.md)     |
| [@filumo/markdown](https://www.npmjs.com/package/@filumo/markdown) | Markdown 阅读、大纲、GFM 排版与代码高亮      | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/markdown/README.zh-CN.md) |
| [@filumo/csv](https://www.npmjs.com/package/@filumo/csv)           | CSV / TSV 只读表格、虚拟滚动和查找           | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/csv/README.zh-CN.md)      |
| [@filumo/xml](https://www.npmjs.com/package/@filumo/xml)           | XML 原文、命名空间结构树和节点定位           | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/xml/README.zh-CN.md)      |
| [@filumo/code](https://www.npmjs.com/package/@filumo/code)         | 代码、脚本、配置及样式源码的只读高亮         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/code/README.zh-CN.md)     |
| [@filumo/react](https://www.npmjs.com/package/@filumo/react)       | React 18/19 适配组件                         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/react/README.zh-CN.md)    |
| [@filumo/vue](https://www.npmjs.com/package/@filumo/vue)           | Vue 3（>=3.3 <4）适配组件                    | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue/README.zh-CN.md)      |
| [@filumo/vue2](https://www.npmjs.com/package/@filumo/vue2)         | Vue 2（^2.6.14 或 ^2.7.16）适配组件          | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue2/README.zh-CN.md)     |
| [@filumo/archive](https://www.npmjs.com/package/@filumo/archive)   | 压缩包目录、按需提取与包内预览               | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/archive/README.zh-CN.md)  |

<!-- filumo-packages:end -->

## 文档与反馈

- [本包源码与完整类型](https://github.com/gyxing/filumo-viewer/tree/master/packages/pdf/src)
- [框架接入指南](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/preview-integration.zh-CN.md)
- [格式能力与限制](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/compatibility.zh-CN.md)
- [文本类格式指南](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/text-formats.zh-CN.md)
- [图片与 PDF 部署](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/image-pdf.zh-CN.md)
- [独立框架示例](https://github.com/gyxing/filumo-viewer/tree/master/examples)
- [项目变更记录](https://github.com/gyxing/filumo-viewer/blob/master/CHANGELOG.md)
- [问题反馈](https://github.com/gyxing/filumo-viewer/issues)
- [MIT 许可证](https://github.com/gyxing/filumo-viewer/blob/master/packages/pdf/LICENSE)
