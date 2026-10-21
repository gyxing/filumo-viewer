# @filumo/core

Headless document sessions, file sources and plugin protocols for Filumo, with DOM-free text utilities.

Filumo 的无界面基础层：统一文件来源、格式探测、插件协议、取消与会话释放；公共文本能力从独立子入口按需导入。

本文档对应 **0.1.0**。以下命令展示 npm 发布后的消费方式；从当前源码工作区使用时，请先按接入指南构建各包。

## 主要能力

- 核心入口不创建 DOM、查看器或格式引擎，适合自定义宿主和协议集成。
- 支持本地 File/Blob、字节、URL 和自定义来源；区间读取、配额和取消由来源租约管理。
- 常规格式探测全部失败后才尝试已注册插件的文本兜底；已经接管的解析错误不会改交其他格式。

## 安装

```sh
pnpm add @filumo/core @filumo/text
# 或使用 npm
npm install @filumo/core @filumo/text
```


## 最小接入

```ts
import { createDocumentController } from '@filumo/core';
import { text } from '@filumo/text';

const controller = createDocumentController({
  plugins: [text({ worker: 'never' }).document],
  resourcePolicy: { maxFileBytes: 2 * 1024 * 1024 },
});

try {
  await controller.open(new File(['第一行\n第二行'], 'example.txt'));
  console.log(controller.getSnapshot().status);
} finally {
  await controller.destroy();
}
```

## 常用配置

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `plugins` | 必填 | DocumentPlugin 描述符列表；可从格式工厂的 .document 取得。 |
| `pluginId` | 自动探测 | 显式选择已注册插件，不隐式安装或切换兜底。 |
| `baseUrl` | 未设置 | 解析相对 URL 时使用的基准地址。 |
| `resourcePolicy.maxFileBytes` | 未设置通用上限 | 读取文件的字节限制。 |
| `resourcePolicy.timeoutMs` | 未设置通用超时 | 单次打开任务的超时。 |

完整类型以公开声明与源码为准；没有列出的功能不能通过猜测选项名开启。

## 公共文本与来源

`@filumo/core/text` 提供 readText、decodeTextBytes、indexLines、textLineAt、findTextMatches、TextContent 和可取消的 Worker 任务协议，不依赖 DOM；主入口不会自动加载全部读取器。

```ts
import { readText } from '@filumo/core/text';

const abort = new AbortController();
const result = await readText(new TextEncoder().encode('第一行\n第二行'), {
  signal: abort.signal,
  encoding: 'auto',
});
if (result.kind === 'ready') {
  console.log(result.document.lineStarts.length);
}
```

`DocumentSource` 最小实现提供 readAll(signal) 和 dispose()，可选提供 readBlob、readRange、getRangeReader。本地 File/Blob 优先复用原 Blob；高效 HTTP 区间读取需要真实 206 和正确 Content-Range，旧 readRange 不能被推测为高效分块。完整读取回退继续复用同一来源缓存。

FilumoError.code 用于区分稳定错误语义，普通取消可能为 AbortError。切换输入、超时和销毁会取消旧任务；宿主自定义来源必须遵守 signal，并释放自己的资源。

## 样式与边界

Core 没有样式文件、界面或格式引擎。上面的例子只读取会话状态，不渲染文件。无 DOM 不代表全部格式驱动都能在任意 Node.js 版本运行；浏览器专用能力由对应格式包说明。字符串输入表示 URL，直接正文使用 File/Blob 或字节。

需要查看器时使用 DOM 或框架适配包；不要将 DocumentPlugin 与带 loadView 的 ViewerPlugin 混为一谈。


## 输入与运行环境

字符串输入表示 URL，不表示文件正文；直接文本内容请使用 File/Blob。支持的来源还包括 Uint8Array、带 name/mimeType/request 的 URL 对象和自定义 DocumentSource 工厂。远程文件和辅助资源需要满足宿主的网络、CORS 与 CSP 配置。

包以 ESM 发布，包含 TypeScript 声明；不提供 CommonJS require 入口。查看器挂载、图片解码和文件选择在浏览器执行；导入轻量入口不等于支持在服务端渲染文件。宿主应在客户端生命周期创建实例，并在不再使用时销毁。

## 公开入口

| 公开入口 | 用途 |
| --- | --- |
| `@filumo/core` | createDocumentController、createSession、normalizeSource、FilumoError 及来源/插件/会话类型 |
| `@filumo/core/text` | 不依赖 DOM 的解码、索引、查找和任务协议 |

未列出的包内路径不是稳定公共 API。独立格式不依赖 React/Vue 适配层，宿主只安装实际需要的格式和适配包。

## Filumo 包清单

当前包已加粗。每个包独立发布，包名链接到 npm，源码链接指向项目实际仓库。

<!-- filumo-packages:start -->

| 包（点击进入 npm） | 用途 | 源码说明 |
| --- | --- | --- |
| **[@filumo/core](https://www.npmjs.com/package/@filumo/core)** | 无 UI 的来源、插件协议、会话和公共文本处理 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/core#readme) |
| [@filumo/dom](https://www.npmjs.com/package/@filumo/dom) | 原生 DOM 查看器、工具栏、原文、大纲和共享 UI | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/dom#readme) |
| [@filumo/viewer](https://www.npmjs.com/package/@filumo/viewer) | 九类格式插件的标准预设与工厂聚合 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/viewer#readme) |
| [@filumo/office](https://www.npmjs.com/package/@filumo/office) | Word、Excel、PowerPoint 与受支持的旧格式 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/office#readme) |
| [@filumo/pdf](https://www.npmjs.com/package/@filumo/pdf) | PDF 连续阅读、大纲、缩略图和查找 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/pdf#readme) |
| [@filumo/image](https://www.npmjs.com/package/@filumo/image) | 图片预览、缩放、旋转、拖动及共享弹层 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/image#readme) |
| [@filumo/text](https://www.npmjs.com/package/@filumo/text) | 纯文本、日志、编码识别与可读文本兜底 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/text#readme) |
| [@filumo/json](https://www.npmjs.com/package/@filumo/json) | JSON / JSONC / JSONL / NDJSON 原文与结构 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/json#readme) |
| [@filumo/markdown](https://www.npmjs.com/package/@filumo/markdown) | Markdown 阅读、大纲、GFM 排版与代码高亮 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/markdown#readme) |
| [@filumo/csv](https://www.npmjs.com/package/@filumo/csv) | CSV / TSV 只读表格、虚拟滚动和查找 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/csv#readme) |
| [@filumo/xml](https://www.npmjs.com/package/@filumo/xml) | XML 原文、命名空间结构树和节点定位 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/xml#readme) |
| [@filumo/code](https://www.npmjs.com/package/@filumo/code) | 代码、脚本、配置及样式源码的只读高亮 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/code#readme) |
| [@filumo/react](https://www.npmjs.com/package/@filumo/react) | React 18/19 适配组件 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/react#readme) |
| [@filumo/vue](https://www.npmjs.com/package/@filumo/vue) | Vue 3（>=3.3 <4）适配组件 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/vue#readme) |
| [@filumo/vue2](https://www.npmjs.com/package/@filumo/vue2) | Vue 2（^2.6.14 或 ^2.7.16）适配组件 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/vue2#readme) |
<!-- filumo-packages:end -->

## 文档与反馈

- [本包源码与完整类型](https://github.com/gyxing/office-file-viewer/tree/master/packages/core/src)
- [框架接入指南](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/guides/preview-integration.zh-CN.md)
- [格式能力与限制](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/guides/compatibility.zh-CN.md)
- [文本类格式指南](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/guides/text-formats.zh-CN.md)
- [图片与 PDF 部署](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/guides/image-pdf.zh-CN.md)
- [独立框架示例](https://github.com/gyxing/office-file-viewer/tree/master/examples)
- [项目变更记录](https://github.com/gyxing/office-file-viewer/blob/master/CHANGELOG.md)
- [问题反馈](https://github.com/gyxing/office-file-viewer/issues)
- [MIT 许可证](https://github.com/gyxing/office-file-viewer/blob/master/packages/core/LICENSE)
