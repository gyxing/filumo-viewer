---
title: 包总览与安装
description: Filumo 0.1.0 的十五个包、九类格式插件、框架安装组合及按需加载边界。
keywords:
  - Filumo
  - file preview
  - document viewer
  - 文件预览
siteLayout: docs
toc: content
---

# 包总览与安装

当前十五个公共包均使用 **0.1.0**。该版本当前尚未发布；npm 链接用于发布后的包发现，不能据此认为包已可下载。发布前请使用本仓库 workspace 或经过构建、打包的本地包。

## 完整包清单

| 包                                                                 | 用途                                      | 源码与详细说明                                                                              |
| ------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| [@filumo/core](https://www.npmjs.com/package/@filumo/core)         | 来源、插件协议、会话及公共文本处理        | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/core#readme)     |
| [@filumo/dom](https://www.npmjs.com/package/@filumo/dom)           | 原生 DOM 外壳、工具栏、大纲及原文公共视图 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/dom#readme)      |
| [@filumo/viewer](https://www.npmjs.com/package/@filumo/viewer)     | 九类格式的轻量标准插件预设                | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/viewer#readme)   |
| [@filumo/office](https://www.npmjs.com/package/@filumo/office)     | Word、Excel、PowerPoint 及支持的 WPS 文档 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/office#readme)   |
| [@filumo/pdf](https://www.npmjs.com/package/@filumo/pdf)           | PDF 连续阅读、缩略图、大纲及查找          | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/pdf#readme)      |
| [@filumo/image](https://www.npmjs.com/package/@filumo/image)       | 独立图片及公共图片弹层交互                | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/image#readme)    |
| [@filumo/text](https://www.npmjs.com/package/@filumo/text)         | 纯文本、日志及可读内容兜底                | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/text#readme)     |
| [@filumo/json](https://www.npmjs.com/package/@filumo/json)         | JSON、JSONC、JSONL 与 NDJSON              | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/json#readme)     |
| [@filumo/markdown](https://www.npmjs.com/package/@filumo/markdown) | Markdown 阅读、原文、大纲及受控 HTML      | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/markdown#readme) |
| [@filumo/csv](https://www.npmjs.com/package/@filumo/csv)           | CSV、TSV 只读表格                         | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/csv#readme)      |
| [@filumo/xml](https://www.npmjs.com/package/@filumo/xml)           | XML 原文与结构双栏                        | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/xml#readme)      |
| [@filumo/code](https://www.npmjs.com/package/@filumo/code)         | 常用代码、配置、脚本及构建文件            | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/code#readme)     |
| [@filumo/react](https://www.npmjs.com/package/@filumo/react)       | React 18/19 适配                          | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/react#readme)    |
| [@filumo/vue](https://www.npmjs.com/package/@filumo/vue)           | Vue 3.3+（小于 4）适配                    | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/vue#readme)      |
| [@filumo/vue2](https://www.npmjs.com/package/@filumo/vue2)         | Vue 2.6/2.7 适配                          | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/vue2#readme)     |

## 如何选择

原生 JavaScript 使用 @filumo/dom 的 createViewer；React、Vue 3、Vue 2 分别选择对应适配器。每个宿主只需要自己的框架运行时，不必安装全部框架。格式包不依赖 React/Vue。

以下命令供发布后使用，假设宿主已安装所需框架：

| 场景                 | 发布后安装命令                             |
| -------------------- | ------------------------------------------ |
| React + Office       | `npm install @filumo/react @filumo/office` |
| Vue 3 + Markdown     | `npm install @filumo/vue @filumo/markdown` |
| Vue 2 + JSON         | `npm install @filumo/vue2 @filumo/json`    |
| 原生 JS + 图片       | `npm install @filumo/dom @filumo/image`    |
| React + 九类格式预设 | `npm install @filumo/react @filumo/viewer` |

pnpm/Yarn 宿主可使用对应的 add 命令。本仓库自身统一使用根 package.json 固定的 pnpm，避免混用锁文件。

## 标准预设与自定义插件

standardPlugins 是冻结的九类轻量描述符数组，不是函数，也不是组件。它包含 Office、Text、JSON、Markdown、Image、PDF、CSV、XML、Code。createViewer 从 @filumo/dom 导入，DocumentViewer 从所选适配器导入。

```tsx | pure
import { DocumentViewer } from '@filumo/react';
import { standardPlugins } from '@filumo/viewer';

export function Preview({ file }: { file?: File }) {
  return (
    <DocumentViewer
      source={file}
      plugins={standardPlugins}
      options={{ height: 640 }}
    />
  );
}
```

PDF 默认由包内模块与资源清单接入，不要求常规宿主手工复制目录；需要自定义资源时，再通过稳定插件数组覆盖对应选项，见[图片与 PDF 指南](./image-pdf)。

```ts | pure
import {
  office,
  text,
  json,
  markdown,
  image,
  pdf,
  csv,
  xml,
  code,
} from '@filumo/viewer';

const plugins = [
  office(),
  text(),
  json(),
  markdown(),
  image(),
  pdf(),
  csv(),
  xml(),
  code(),
];
```

安装 @filumo/viewer 会安装它声明的全部格式依赖；按需加载控制浏览器执行，不会延迟 npm 安装。只需要一个格式时直接安装该格式包。插件数组保持稳定，避免每次框架渲染时重建查看器。

## 按需加载与公共复用

注册只创建描述符，匹配文件后才加载驱动和视图。JSON/XML 的原文与结构、Markdown 的原文与阅读、PDF 的文字层与缩略图，以及代码高亮按相应操作继续延迟加载。

公共解码、行索引和查找位于 @filumo/core/text；原文、大纲、分栏等公共视图位于 DOM 子入口。JSON、Markdown、CSV、XML、Code 不需要通过 Text 包取得这些公共逻辑。@filumo/text/reader 与 @filumo/text/view 保留兼容导出，新集成优先使用 Core/DOM 的公开入口。

## 样式、Worker 与 PDF 资源

默认自动加载外壳及当前格式样式，无需导入 Less。external 模式需由宿主直接安装并依序导入 DOM 与所用格式的 styles.css；Office 图片弹层还需要 Image 样式。框架适配器及标准预设没有自己的 styles.css。

格式 Worker 使用 ESM；手动复制时保留 worker.js、worker-chunks 与相对路径。Vite 使用 worker.format: 'es'。PDF 的引擎、Worker 和辅助资源必须来自相同的固定 PDF.js 版本，不能只复制一个 Worker 文件。

## 版本、限制与贡献

各包同为 0.1.0；不要混用不同版本的 Worker、资源与外部样式。所有预览均为只读，不承诺完整 Office 排版或无限文件大小。声明支持范围和历史验证记录见[兼容范围](./compatibility)。

源码采用 MIT 许可证。 [GitHub](https://github.com/gyxing/office-file-viewer) · [Issues](https://github.com/gyxing/office-file-viewer/issues) · [CHANGELOG](https://github.com/gyxing/office-file-viewer/blob/master/CHANGELOG.md)
