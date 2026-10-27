# @filumo/archive

<p>
<a href="https://github.com/gyxing/filumo-viewer/blob/master/packages/archive/README.md">English</a> | <strong>简体中文</strong> ·
<a href="https://gyxing.github.io/filumo-viewer/playground" target="_blank" rel="noopener noreferrer">在线示例</a> ·
<a href="https://gyxing.github.io/filumo-viewer/docs" target="_blank" rel="noopener noreferrer">对接文档</a>
</p>

只读压缩包浏览器，提供带线条目录树、可见行文件列表，以及交给宿主已注册插件的按需条目预览。

顶部仅显示一套工具栏，预览子文件时显示该文件的查找、缩放、页码等能力。返回上级和文件名搜索固定在左侧树上方。预览时下载菜单区分当前文件和原压缩包；原压缩包始终指最外层打开的归档，面包屑展示当前文件路径。

本文档对应 **0.1.0**。仓库功能可能早于 npm 发布。

## 格式与加载

ZIP 与 JAR/WAR/EAR/APK/AAB/CBZ/KMZ 等 ZIP 容器仅浏览包内文件，不运行程序或承诺容器专业语义。TAR、GZIP/TAR.GZ、RAR v4/v5、7z、TAR.XZ/TXZ 采用不同读取后端；首版不包括单文件 XZ、加密和分卷归档。具体压缩变体以该版本的真实样本验证为准。

注册仅创建描述符。ZIP 使用 zip.js，TAR 按偏移读取，GZIP 处理顺序流。仅打开 RAR/7z/TAR.XZ 等格式时才加载固定版本的 libarchive-wasm。

首版保留一个新增引擎，可读取 XZ 压缩的 TAR，包括 TAR.XZ 和 TXZ。上游未开放仅压缩单文件的 XZ 流所需的 raw 格式入口，因此暂不支持 `.xz`、`.log.xz` 等单文件 XZ，不额外引入解压依赖。

## 安装

```sh
pnpm add @filumo/dom @filumo/archive @filumo/text @filumo/code
```

## 最小接入

```ts
import { createViewer } from '@filumo/dom';
import { archive } from '@filumo/archive';
import { text } from '@filumo/text';
import { code } from '@filumo/code';
const container = document.getElementById('viewer');
if (!container) throw new Error('Preview container is missing');
const viewer = createViewer(container, {
  height: 640,
  plugins: [archive(), text(), code()],
});
await viewer.open('/files/example.zip');
// 不再使用时释放归档、Worker 和子查看器。
window.addEventListener(
  'pagehide',
  () => {
    void viewer.destroy();
  },
  { once: true },
);
```

包内只使用已注册的格式插件。Archive 不隐式安装 Office、PDF 或框架适配器；完整预设使用 @filumo/viewer。

## 配置与预算

| 配置                                     | 默认值          | 用途                             |
| ---------------------------------------- | --------------- | -------------------------------- |
| resourcePolicy.maxEntries                | 20,000          | 目录条目数量                     |
| resourcePolicy.maxEntryBytes             | 128 MiB         | 单个子文件预览上限               |
| resourcePolicy.maxTotalUncompressedBytes | 512 MiB         | 重放和嵌套共享累计实际输出       |
| resourcePolicy.maxNestedDepth            | 2               | 根深度为 0                       |
| resourcePolicy.cacheBytes                | 64 MiB          | 完整条目缓存                     |
| resourcePolicy.maxWasmInputBytes         | 64 MiB          | 完整读取前检查的 WASM 输入上限   |
| resourcePolicy.maxFullReadBytes          | 128 MiB         | 全文回退上限，不限制有效区间浏览 |
| workerFactory                            | 包内模块 Worker | 可选创建方式覆盖                 |
| assetsBaseUrl                            | 包内资源        | 可选同版本 WASM 资源目录         |

## 大文件边界

目录浏览、提取、子文档预览和原包下载的成本不同。ZIP/TAR 优先复用有效的来源区间能力；远程服务需要真正的 206 与正确 Content-Range。无区间能力时只能在预算内回退完整读取。

TAR.GZ 建索引需要顺序解压并丢弃正文，再次提取可能从头重放。WASM 格式当前需要完整输入和引擎内存；索引也逐块丢弃并计费文件正文，约束固实包的解码量，不承诺同等的大文件能力。缓存预算不是进程内存上限。取消忙碌 Worker 时会保守保留最多一块未确认输出的额度，不能靠重建重置累计预算。

私有大远程原包下载由 ViewerOptions.downloadOriginal 接管；默认路径无法安全完成时不会静默整包读入 JS。

## 子文档资源

HTML/Markdown 图片可解析归档内唯一、合法的相邻图片条目，Blob URL 跟随子预览关闭释放。歧义和越界路径被阻止。跨文件文档链接默认阻止，渲染链接不提前提取或运行目标内容。

## 样式与资源

默认随实际视图加载样式。external 模式在创建前导入 @filumo/dom/styles.css、@filumo/archive/styles.css 及实际子格式 CSS。Worker/WASM 默认随包集成，不要求 CDN 或手工复制公开目录，部署须保留发布资源的相对结构。WASM 旁附带第三方许可声明。

公开入口：@filumo/archive、@filumo/archive/styles.css、@filumo/archive/worker.js、@filumo/archive/assets。内部路径不属于稳定 API。

## Filumo 包清单

<!-- filumo-packages:start -->

| 包（点击进入 npm）                                                   | 用途                                         | 源码说明                                                                                        |
| -------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [@filumo/core](https://www.npmjs.com/package/@filumo/core)           | 无 UI 的来源、插件协议、会话和公共文本处理   | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/core/README.zh-CN.md)     |
| [@filumo/dom](https://www.npmjs.com/package/@filumo/dom)             | 原生 DOM 查看器、工具栏、原文、大纲和共享 UI | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/dom/README.zh-CN.md)      |
| [@filumo/viewer](https://www.npmjs.com/package/@filumo/viewer)       | 十类格式插件的标准预设与工厂聚合             | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/viewer/README.zh-CN.md)   |
| [@filumo/office](https://www.npmjs.com/package/@filumo/office)       | Word、Excel、PowerPoint 与受支持的旧格式     | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/office/README.zh-CN.md)   |
| [@filumo/pdf](https://www.npmjs.com/package/@filumo/pdf)             | PDF 连续阅读、大纲、缩略图和查找             | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/pdf/README.zh-CN.md)      |
| [@filumo/image](https://www.npmjs.com/package/@filumo/image)         | 图片预览、缩放、旋转、拖动及共享弹层         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/image/README.zh-CN.md)    |
| [@filumo/text](https://www.npmjs.com/package/@filumo/text)           | 纯文本、日志、编码识别与可读文本兜底         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/text/README.zh-CN.md)     |
| [@filumo/json](https://www.npmjs.com/package/@filumo/json)           | JSON / JSONC / JSONL / NDJSON 原文与结构     | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/json/README.zh-CN.md)     |
| [@filumo/markdown](https://www.npmjs.com/package/@filumo/markdown)   | Markdown 阅读、大纲、GFM 排版与代码高亮      | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/markdown/README.zh-CN.md) |
| [@filumo/csv](https://www.npmjs.com/package/@filumo/csv)             | CSV / TSV 只读表格、虚拟滚动和查找           | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/csv/README.zh-CN.md)      |
| [@filumo/xml](https://www.npmjs.com/package/@filumo/xml)             | XML 原文、命名空间结构树和节点定位           | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/xml/README.zh-CN.md)      |
| [@filumo/code](https://www.npmjs.com/package/@filumo/code)           | 代码、脚本、配置及样式源码的只读高亮         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/code/README.zh-CN.md)     |
| [@filumo/react](https://www.npmjs.com/package/@filumo/react)         | React 18/19 适配组件                         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/react/README.zh-CN.md)    |
| [@filumo/vue](https://www.npmjs.com/package/@filumo/vue)             | Vue 3（>=3.3 <4）适配组件                    | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue/README.zh-CN.md)      |
| [@filumo/vue2](https://www.npmjs.com/package/@filumo/vue2)           | Vue 2（^2.6.14 或 ^2.7.16）适配组件          | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue2/README.zh-CN.md)     |
| **[@filumo/archive](https://www.npmjs.com/package/@filumo/archive)** | 压缩包目录、按需提取与包内预览               | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/archive/README.zh-CN.md)  |

<!-- filumo-packages:end -->

## 文档与反馈

[部署指南](https://gyxing.github.io/filumo-viewer/zh-CN/docs/guides/deployment) · [API](https://gyxing.github.io/filumo-viewer/zh-CN/docs/guides/plugin-api) · [反馈](https://github.com/gyxing/filumo-viewer/issues)
