# Filumo

Filumo is a framework-independent, plugin-based file preview toolkit for Office, PDF, images, text, structured data and source code.

Filumo 是跨框架、按需加载的多格式文件预览库。当前工作区版本为 **0.1.0**，尚未发布 npm，不兼容旧包入口。格式视图使用原生 DOM；React、Vue 3、Vue 2 仅作为薄适配层。

## 格式与选型

- Office：Word、Excel、PowerPoint 及声明支持的旧格式、宏启用文件和模板；只读取内容，不执行宏。
- 文档与数据：PDF 连续阅读、Markdown、纯文本与日志、JSON/JSONC/JSONL/NDJSON、XML、CSV/TSV。
- 图片与代码：浏览器支持的 PNG/JPEG/GIF/WebP/BMP/SVG/AVIF，以及常用代码、脚本、构建文件、配置和样式源码。
- 所有格式均为只读预览，不提供编辑保存、OCR 或格式转换。

只需要部分格式时，安装 DOM 或相应框架适配包，再注册独立格式插件。需要九类格式时使用 @filumo/viewer 的 standardPlugins 数组；安装标准预设会包含全部格式依赖，但引擎、视图、样式与 Worker 仍按实际需要加载。

## 安装与最小接入

以下命令展示对应版本发布后的 npm 消费方式；发布前请从工作区构建并按接入指南使用。

```sh
pnpm add @filumo/dom @filumo/viewer
# 或使用 npm
npm install @filumo/dom @filumo/viewer
```

```html
<div id="viewer"></div>
<button id="dispose" type="button">关闭预览</button>
```

```ts
import { createViewer } from '@filumo/dom';
import { standardPlugins } from '@filumo/viewer';

const container = document.getElementById('viewer');
if (!container) throw new Error('缺少预览容器');
const viewer = createViewer(container, {
  plugins: standardPlugins,
  height: 640,
  onError: (error) => console.error(error),
});

try {
  await viewer.open(new File(['# Filumo\n\n多格式文档预览'], 'example.md'));
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

字符串输入表示 URL，正文请使用 File/Blob 或字节；远程文件及辅助资源需要满足宿主 CORS/CSP。createViewer 来自 @filumo/dom，standardPlugins 来自 @filumo/viewer，不要调用 standardPlugins()。组件或页面释放时销毁句柄。

React、Vue 3、Vue 2 宿主分别使用 @filumo/react、@filumo/vue、@filumo/vue2 的 DocumentViewer，传入稳定的 plugins 数组。每个包的 README 都有独立安装、示例、配置及资源要求。

## 样式、Worker 与 PDF 资源

auto 模式随视图取得样式租约，通常无需手工导入 CSS。external 模式需要创建前加载 @filumo/dom/styles.css 和实际格式的 styles.css；Office 图片弹层还需要 @filumo/image/styles.css。适配器与标准预设没有各自的 styles.css。

手动导入外部 CSS 时，将相应样式包列为宿主直接依赖，避免在严格依赖布局下无法解析。

格式 Worker 部署时保留所属包 worker.js 与 worker-chunks 相对结构。PDF 默认使用包内同版引擎、Worker、辅助资源与文字层样式；仅选择整套外部部署时才需要复制资源，详见 [PDF 包说明](https://github.com/gyxing/office-file-viewer/tree/master/packages/pdf#readme)，默认不使用公共 CDN，单项目录和整套资源根目录均可覆盖。

## Filumo 包清单

包名链接到 npm，源码说明指向项目实际仓库；15 个正式包均为 0.1.0。

<!-- filumo-packages:start -->

| 包（点击进入 npm）                                                 | 用途                                         | 源码说明                                                                                    |
| ------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [@filumo/core](https://www.npmjs.com/package/@filumo/core)         | 无 UI 的来源、插件协议、会话和公共文本处理   | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/core#readme)     |
| [@filumo/dom](https://www.npmjs.com/package/@filumo/dom)           | 原生 DOM 查看器、工具栏、原文、大纲和共享 UI | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/dom#readme)      |
| [@filumo/viewer](https://www.npmjs.com/package/@filumo/viewer)     | 九类格式插件的标准预设与工厂聚合             | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/viewer#readme)   |
| [@filumo/office](https://www.npmjs.com/package/@filumo/office)     | Word、Excel、PowerPoint 与受支持的旧格式     | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/office#readme)   |
| [@filumo/pdf](https://www.npmjs.com/package/@filumo/pdf)           | PDF 连续阅读、大纲、缩略图和查找             | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/pdf#readme)      |
| [@filumo/image](https://www.npmjs.com/package/@filumo/image)       | 图片预览、缩放、旋转、拖动及共享弹层         | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/image#readme)    |
| [@filumo/text](https://www.npmjs.com/package/@filumo/text)         | 纯文本、日志、编码识别与可读文本兜底         | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/text#readme)     |
| [@filumo/json](https://www.npmjs.com/package/@filumo/json)         | JSON / JSONC / JSONL / NDJSON 原文与结构     | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/json#readme)     |
| [@filumo/markdown](https://www.npmjs.com/package/@filumo/markdown) | Markdown 阅读、大纲、GFM 排版与代码高亮      | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/markdown#readme) |
| [@filumo/csv](https://www.npmjs.com/package/@filumo/csv)           | CSV / TSV 只读表格、虚拟滚动和查找           | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/csv#readme)      |
| [@filumo/xml](https://www.npmjs.com/package/@filumo/xml)           | XML 原文、命名空间结构树和节点定位           | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/xml#readme)      |
| [@filumo/code](https://www.npmjs.com/package/@filumo/code)         | 代码、脚本、配置及样式源码的只读高亮         | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/code#readme)     |
| [@filumo/react](https://www.npmjs.com/package/@filumo/react)       | React 18/19 适配组件                         | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/react#readme)    |
| [@filumo/vue](https://www.npmjs.com/package/@filumo/vue)           | Vue 3（>=3.3 <4）适配组件                    | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/vue#readme)      |
| [@filumo/vue2](https://www.npmjs.com/package/@filumo/vue2)         | Vue 2（^2.6.14 或 ^2.7.16）适配组件          | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/vue2#readme)     |

<!-- filumo-packages:end -->

## 工作区开发

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm docs:dev
pnpm smoke
```

apps/docs 是私有文档与烟测应用，packages 包含十五个公开组件包，examples 是独立消费宿主。当前文档中的命令不代表本次改动已执行对应验证。

pnpm smoke 默认进入 /dev/smoke-test，pnpm docs:dev 进入文档首页；两者直接编译工作区源码。包清单、品牌或构建配置变更后需正常重启服务，以读取新配置并重新生成版本及开发资源。

### 独立框架示例

```sh
pnpm demo:js
pnpm demo:react
pnpm demo:vue3
pnpm demo:vue2
```

只需选择一个服务；pnpm demo 默认原生 JavaScript，默认地址 http://127.0.0.1:4173/。同时启动时可指定不同端口，例如 pnpm demo:vue3 --port 4174。

独立示例消费已构建包，不自动构建或热更新 packages 源码。首次运行或源码变化后需构建，正在运行的独立示例也需重新启动。真实样本存放在忽略的 tests/fixtures/local，不进入公开文档。

本地文档默认从 / 访问；子目录部署通过 FILUMO_DOCS_BASE 配置，例如当前真实 Pages 项目的 /office-file-viewer/。当前 GitHub 仓库路径尚未改名。

## 文档与反馈

- [框架接入指南](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/guides/preview-integration.zh-CN.md)
- [API 文档](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/docs.zh-CN.md)
- [文本类格式与边界](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/guides/text-formats.zh-CN.md)
- [图片与 PDF 部署](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/guides/image-pdf.zh-CN.md)
- [兼容范围](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/guides/compatibility.zh-CN.md)
- [回归与本地样本](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/guides/testing.zh-CN.md)
- [迁移说明](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/guides/migration-from-office-file-viewer.zh-CN.md)
- [变更记录](https://github.com/gyxing/office-file-viewer/blob/master/CHANGELOG.md)
- [问题反馈](https://github.com/gyxing/office-file-viewer/issues)
- [MIT 许可证](https://github.com/gyxing/office-file-viewer/blob/master/LICENSE)
