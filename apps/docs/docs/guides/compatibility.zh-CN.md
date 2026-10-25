---
title: Filumo 兼容范围与限制
description: Filumo 的框架声明范围、格式限制、资源预算与历史验证记录边界。
keywords:
  - Filumo
  - file preview
  - document viewer
  - 文件预览
siteLayout: docs
toc: content
---

# 兼容范围与限制

## 当前版本与声明支持范围

文档跟随仓库源码，各包发布版本以 npm 为准。以下内容描述源码能力与依赖声明，不等同于当前版本已经通过完整浏览器验收。

| 宿主            | 声明范围                  | 接入包        |
| --------------- | ------------------------- | ------------- |
| React           | >=18 <20                  | @filumo/react |
| Vue 3           | >=3.3 <4                  | @filumo/vue   |
| Vue 2           | ^2.6.14 或 ^2.7.16        | @filumo/vue2  |
| 原生 JavaScript | 现代浏览器中的 ESM 与 DOM | @filumo/dom   |

工作区使用固定版本 pnpm；独立宿主可选择自己的包管理器。格式包不依赖 React/Vue，私有文档应用使用 React/Ant Design 不代表消费者也必须安装它们。

## 历史验证与本次状态

历史记录曾包含 React 18.3.1/19.2.0、Vue 3.5.43、Vue 2.6.14/2.7.16、Vite 5.4.21，以及独立包消费、Worker、样式和部署子目录检查。记录仅证明对应提交、产物及环境，不外推到未测试组合。

当前版本是否可发布，应以相同提交上的构建、类型、单元、独立消费及真实浏览器记录为准。没有实际执行的检查不标为通过；PDF 性能还需代表性大文件测量。各包默认预算用于限制局部工作量，不代表整个浏览器进程的内存上限。

### 验证矩阵

| 范围 | 证据与边界 |
| --- | --- |
| 构建、类型、单元检查 | 对应提交的 Validate 工作流 |
| 框架消费 | 实际打包产物与 npm/Yarn 宿主步骤 |
| Chromium UI | 公开样本浏览器步骤，不代表 Safari/Firefox 已验证 |
| GitHub Pages | 同一提交的部署与实际 base |
| 大型扫描件、其他浏览器、SSR | 需目标环境验收，未执行的检查不能标为通过 |

[工作流记录](https://github.com/gyxing/filumo-viewer/actions)标明验证所用提交及环境。

## 九类格式插件

Office、PDF、Image、Text、JSON、Markdown、CSV、XML、Code 均已接入标准预设，完整十五包清单见[包总览](./packages)。

图片依赖浏览器解码器；PDF 依赖固定 PDF.js 及同版资源，见[图片与 PDF](./image-pdf)。文本、结构化文件与代码的编码、预算及语言范围见[对应指南](./text-formats)。

## 文件格式

以下清单覆盖九类插件默认识别的全部后缀与明确文件名。扩展名不区分大小写；文件名和 MIME 只参与识别，仍需通过实际内容校验。

<!-- filumo-format-catalog:start -->
### Office 文档 · @filumo/office

| 分组 | 扩展名 | 文件名及变体 |
| --- | --- | --- |
| Word / WPS | `.doc`, `.wps`, `.docx`, `.docm`, `.dotx` | - |
| Excel | `.xls`, `.xlsx`, `.xlsm`, `.xltx` | - |
| PowerPoint | `.ppt`, `.pptx`, `.pptm`, `.potx` | - |

只读预览文档、工作簿、演示文稿及支持的模板；宏启用文件仅展示支持的内容，不执行宏。

### PDF · @filumo/pdf

| 分组 | 扩展名 | 文件名及变体 |
| --- | --- | --- |
| PDF 文档 | `.pdf` | - |

连续阅读、大纲、缩略图与文字查找；不提供 OCR，纯扫描页不会自动生成可搜索文字。

### 图片 · @filumo/image

| 分组 | 扩展名 | 文件名及变体 |
| --- | --- | --- |
| 图片文件 | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.svg`, `.avif` | - |

能否呈现取决于浏览器解码能力，AVIF 也受此限制。SVG 以图片上下文展示，不把任意 XML 当作图片。

### 纯文本 · @filumo/text

| 分组 | 扩展名 | 文件名及变体 |
| --- | --- | --- |
| 文本与日志 | `.txt`, `.log`, `.ini`, `.conf`, `.cfg`, `.properties`, `.out` | - |

其他未知后缀或无后缀文件仅在可读性检查通过后尝试可选的文本兜底；二进制内容及专用格式解析失败不转为纯文本。

### JSON · @filumo/json

| 分组 | 扩展名 | 文件名及变体 |
| --- | --- | --- |
| JSON 及变体 | `.json`, `.jsonc`, `.jsonl`, `.ndjson` | - |

JSONC 支持注释及尾逗号；JSONL、NDJSON 按记录独立校验。不支持 JSON5。

### Markdown · @filumo/markdown

| 分组 | 扩展名 | 文件名及变体 |
| --- | --- | --- |
| Markdown 文件 | `.md`, `.markdown` | - |

阅读模式呈现 GFM 与受控 HTML，不执行脚本、不应用全局样式、不嵌入任意页面；不提供公式或 Mermaid 渲染。

### CSV / TSV · @filumo/csv

| 分组 | 扩展名 | 文件名及变体 |
| --- | --- | --- |
| 分隔符表格 | `.csv`, `.tsv` | - |

只读表格保留字段字符串，支持分隔符切换与选区复制，不执行公式。

### XML · @filumo/xml

| 分组 | 扩展名 | 文件名及变体 |
| --- | --- | --- |
| XML 文档 | `.xml` | - |

原文与结构视图保留命名空间和属性，拒绝 DTD 声明；SVG 归图片插件处理。

### 代码与开发文件 · @filumo/code

| 分组 | 扩展名 | 文件名及变体 |
| --- | --- | --- |
| JavaScript、TypeScript 与 HTML | `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, `.tsx`, `.html`, `.htm` | - |
| 样式文件 | `.css`, `.less`, `.scss`, `.sass` | - |
| Shell、PowerShell 与批处理 | `.sh`, `.bash`, `.zsh`, `.ps1`, `.psm1`, `.psd1`, `.bat`, `.cmd` | - |
| 其他常用编程语言 | `.py`, `.pyw`, `.sql`, `.java`, `.c`, `.h`, `.cpp`, `.cc`, `.cxx`, `.hpp`, `.hh`, `.hxx`, `.cs`, `.go`, `.rs`, `.php`, `.rb`, `.rake`, `.kt`, `.kts`, `.swift`, `.lua` | - |
| 配置与环境文件 | `.yaml`, `.yml`, `.toml`, `.env` | `.env`, `.env.*` |
| 构建、协议与补丁 | `.dockerfile`, `.mk`, `.cmake`, `.graphql`, `.gql`, `.proto`, `.diff`, `.patch` | `Dockerfile`, `Makefile`, `GNUmakefile`, `CMakeLists.txt`, `Dockerfile.*` |

仅预览源码，不渲染 HTML、不执行脚本、不编译或应用样式。文件名变体遇到 JSON、XML 等专用后缀时仍由专用插件处理。Vue、Svelte 混合语法不在当前支持范围内。
<!-- filumo-format-catalog:end -->

## 排版与功能边界

- Word：字体、分页、浮动对象、复杂表格和修订可能与 Office/WPS 有差异。
- Excel：支持既有缓存值和静态业务语义展示，不提供完整公式重算、数据编辑或外部数据连接。
- PPT：复杂母版、SmartArt、艺术字、动画与媒体编码不保证全部还原；转场是已支持子集。
- 图片：浏览器解码、矢量转换和资源内容决定是否可呈现；损坏或不支持的格式通过错误/告警反馈。
- 批注、修订、水印、阅读模式是只读预览能力，不意味着具备编辑保存。

## 浏览器与框架

目标是支持现代 DOM、Worker、ResizeObserver、Blob 和 ESM 的浏览器，不支持 IE11。Vue 2 支持不隐含 Webpack 4、旧 Chromium 或全部 SSR 框架的默认配置可用。

纯模块导入可用于服务端构建场景，但创建查看器、读取 File 和挂载渲染应在客户端执行。Next.js 等宿主需要明确客户端边界；未验证的构建器应检查 Worker 和资源输出。

## 大文件与性能

长文档采用渐进解析和窗口化呈现。首屏就绪、全部分页完成、图片加载完成是不同状态。内存、压缩包展开量、字体数量、表格尺寸和媒体大小都影响性能。

按真实文件分布配置资源限制并定向压测；不要宣称固定毫秒内加载或不限制文件大小。停用视图可减少呈现工作，但不等同于释放会话；离开页面调用 destroy。

## 安全与资源部署

- 文件本地解析不等于可以信任任意文件。对来源、大小、超时和压缩比设置符合业务的边界。
- 外部字体、媒体和链接受浏览器 CORS、CSP 与组件资源策略约束。
- 自动样式使用 style 标签与版本作用域；严格 CSP 需正确 nonce，动态样式属性仍受 style-src-attr 限制。
- 自定义 workerFactory 必须指向可访问的模块 Worker；返回 HTML/404 的路径不能工作。
- 不将真实文件、授权头、用户隐私内容纳入公开站点或 CI 截图。

## 验证建议

对目标框架、生产打包器、部署子目录及代表性文档做真实浏览器检查。至少覆盖文件打开、连续切换、缩放、查找、图片弹层、销毁和自动样式。类型检查通过只能证明声明一致，不能替代视觉验收。
