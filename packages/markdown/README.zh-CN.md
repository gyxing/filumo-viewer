# @filumo/markdown

<p>
<a href="https://github.com/gyxing/filumo-viewer/blob/master/packages/markdown/README.md">English</a> | <strong>简体中文</strong> ·
<a href="https://gyxing.github.io/filumo-viewer/playground" target="_blank" rel="noopener noreferrer">在线示例</a> ·
<a href="https://gyxing.github.io/filumo-viewer/docs" target="_blank" rel="noopener noreferrer">对接文档</a>
</p>

Markdown 文档阅读插件，支持目录、查找、常见 GFM 排版、受控 HTML 节点和按需代码高亮，阅读与原文可以切换。

本文档对应 **0.1.0**。以下命令展示 npm 发布后的消费方式；从当前源码工作区使用时，请先按接入指南构建各包。

## 主要能力

- 支持标题、列表、任务列表、表格、引用、链接、图片和围栏代码块；大纲保持在主工具栏。
- 常用 HTML 标签通过受控节点和属性规则呈现，代码块里的 HTML 仍显示为源码；相对图片与链接可由宿主解析。
- Marked 仅在阅读解析时加载；highlight.js 核心和语法在可见代码块需要时加载，不因注册插件提前进入首屏。

## 安装

```sh
pnpm add @filumo/dom @filumo/markdown
# 或使用 npm
npm install @filumo/dom @filumo/markdown
```

## 最小接入

```html
<div id="viewer"></div>
<button id="dispose" type="button">关闭预览</button>
```

```ts
import { createViewer } from '@filumo/dom';
import { markdown } from '@filumo/markdown';

const container = document.getElementById('viewer');
if (!container) throw new Error('缺少预览容器');

const viewer = createViewer(container, {
  plugins: [markdown()],
  height: 640,
  locale: 'zh-CN',
  resourcePolicy: { maxFileBytes: 20 * 1024 * 1024 },
  onError: (error) => console.error(error),
});

try {
  await viewer.open(
    new File(['# Filumo\n\n- [x] 已完成\n- [ ] 待处理'], 'example.md'),
  );
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

| 配置项                   | 默认值             | 说明                                                                  |
| ------------------------ | ------------------ | --------------------------------------------------------------------- |
| `encoding`               | auto               | 原文编码。                                                            |
| `initialMode`            | reading            | reading 或 source；原文模式不加载 Markdown 解析。                     |
| `outline`                | true               | 是否初始显示标题大纲。                                                |
| `highlight`              | true               | 是否对可见代码块执行高亮增强。                                        |
| `maxHighlightChars`      | 65,536             | 单代码块进入高亮增强的字符上限。                                      |
| `baseUrl`                | 未设置             | 相对链接和图片的基准地址；本地 File 不自带所在磁盘目录的访问权。      |
| `resolveResource`        | 未设置             | 按 reference、image/link 和 signal 返回资源 URL；异步工作需遵守取消。 |
| `worker / workerFactory` | auto / 内置 Worker | Markdown 解析任务执行方式。                                           |

完整类型以公开声明与源码为准；没有列出的功能不能通过猜测选项名开启。

## HTML、链接与资源

常用 HTML 标签（含 table、a、br、details）通过受控节点构造，只保留允许的属性及局部排版信息；不直接执行任意文档 HTML。脚本、事件属性及不允许的 URL 不作为活动内容保留，HTML 代码块仍展示源码。

相对图片和链接可由 baseUrl 或 resolveResource 处理，返回 URL 的异步任务需遵守 signal。打开本地 Markdown 不等于取得相邻磁盘文件的访问权。表格按阅读区宽度布局，图片和代码增强按需加载。

## 能力边界

不包含数学公式、Mermaid 图形渲染或编辑器。代码高亮是增强功能，未知语法、超预算或失败时继续显示代码原文。原文模式默认隐藏行号；标题大纲与阅读正文滚动联动。

## 样式与运行环境

默认 auto 模式随实际视图加载样式，通常不需要手动导入 CSS。若宿主选择 `stylePolicy: { mode: 'external' }`，在创建查看器前加载匹配版本的外部样式：

```ts
import '@filumo/dom/styles.css';
import '@filumo/markdown/styles.css';
```

模块 Worker 部署时保留本包 worker.js 和 worker-chunks 相对结构；打包器无法自动处理时通过 workerFactory 创建。auto 按环境选择任务执行方式，always 要求可用 Worker，never 使用本包允许的无 Worker 路径；Code 的高亮例外见 Code 包说明，不会回退到主线程做同样的增强。

字符串输入表示 URL，不表示文件正文；直接文本内容请使用 File/Blob。支持的来源还包括 Uint8Array、带 name/mimeType/request 的 URL 对象和自定义 DocumentSource 工厂。远程文件和辅助资源需要满足宿主的网络、CORS 与 CSP 配置。

包以 ESM 发布，包含 TypeScript 声明；不提供 CommonJS require 入口。查看器挂载、图片解码和文件选择在浏览器执行；导入轻量入口不等于支持在服务端渲染文件。宿主应在客户端生命周期创建实例，并在不再使用时销毁。

## 公开入口

| 公开入口                      | 用途                                                     |
| ----------------------------- | -------------------------------------------------------- |
| `@filumo/markdown`            | markdown 工厂及公开配置类型                              |
| `@filumo/markdown/styles.css` | 预编译外部样式资源，用于 external 样式模式               |
| `@filumo/markdown/worker.js`  | 模块 Worker 资源；部署时保留相关分块，不作为普通函数导入 |

未列出的包内路径不是稳定公共 API。独立格式不依赖 React/Vue 适配层，宿主只安装实际需要的格式和适配包。

## Filumo 包清单

当前包已加粗。每个包独立发布，包名链接到 npm，源码链接指向项目实际仓库。

<!-- filumo-packages:start -->

| 包（点击进入 npm）                                                     | 用途                                         | 源码说明                                                                                        |
| ---------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [@filumo/core](https://www.npmjs.com/package/@filumo/core)             | 无 UI 的来源、插件协议、会话和公共文本处理   | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/core/README.zh-CN.md)     |
| [@filumo/dom](https://www.npmjs.com/package/@filumo/dom)               | 原生 DOM 查看器、工具栏、原文、大纲和共享 UI | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/dom/README.zh-CN.md)      |
| [@filumo/viewer](https://www.npmjs.com/package/@filumo/viewer)         | 九类格式插件的标准预设与工厂聚合             | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/viewer/README.zh-CN.md)   |
| [@filumo/office](https://www.npmjs.com/package/@filumo/office)         | Word、Excel、PowerPoint 与受支持的旧格式     | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/office/README.zh-CN.md)   |
| [@filumo/pdf](https://www.npmjs.com/package/@filumo/pdf)               | PDF 连续阅读、大纲、缩略图和查找             | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/pdf/README.zh-CN.md)      |
| [@filumo/image](https://www.npmjs.com/package/@filumo/image)           | 图片预览、缩放、旋转、拖动及共享弹层         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/image/README.zh-CN.md)    |
| [@filumo/text](https://www.npmjs.com/package/@filumo/text)             | 纯文本、日志、编码识别与可读文本兜底         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/text/README.zh-CN.md)     |
| [@filumo/json](https://www.npmjs.com/package/@filumo/json)             | JSON / JSONC / JSONL / NDJSON 原文与结构     | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/json/README.zh-CN.md)     |
| **[@filumo/markdown](https://www.npmjs.com/package/@filumo/markdown)** | Markdown 阅读、大纲、GFM 排版与代码高亮      | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/markdown/README.zh-CN.md) |
| [@filumo/csv](https://www.npmjs.com/package/@filumo/csv)               | CSV / TSV 只读表格、虚拟滚动和查找           | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/csv/README.zh-CN.md)      |
| [@filumo/xml](https://www.npmjs.com/package/@filumo/xml)               | XML 原文、命名空间结构树和节点定位           | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/xml/README.zh-CN.md)      |
| [@filumo/code](https://www.npmjs.com/package/@filumo/code)             | 代码、脚本、配置及样式源码的只读高亮         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/code/README.zh-CN.md)     |
| [@filumo/react](https://www.npmjs.com/package/@filumo/react)           | React 18/19 适配组件                         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/react/README.zh-CN.md)    |
| [@filumo/vue](https://www.npmjs.com/package/@filumo/vue)               | Vue 3（>=3.3 <4）适配组件                    | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue/README.zh-CN.md)      |
| [@filumo/vue2](https://www.npmjs.com/package/@filumo/vue2)             | Vue 2（^2.6.14 或 ^2.7.16）适配组件          | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/vue2/README.zh-CN.md)     |

<!-- filumo-packages:end -->

## 文档与反馈

- [本包源码与完整类型](https://github.com/gyxing/filumo-viewer/tree/master/packages/markdown/src)
- [框架接入指南](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/preview-integration.zh-CN.md)
- [格式能力与限制](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/compatibility.zh-CN.md)
- [文本类格式指南](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/text-formats.zh-CN.md)
- [图片与 PDF 部署](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/image-pdf.zh-CN.md)
- [独立框架示例](https://github.com/gyxing/filumo-viewer/tree/master/examples)
- [项目变更记录](https://github.com/gyxing/filumo-viewer/blob/master/CHANGELOG.md)
- [问题反馈](https://github.com/gyxing/filumo-viewer/issues)
- [MIT 许可证](https://github.com/gyxing/filumo-viewer/blob/master/packages/markdown/LICENSE)
