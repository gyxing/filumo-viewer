# @filumo/text

<p>
<a href="https://github.com/gyxing/filumo-viewer/blob/master/packages/text/README.md">English</a> | <strong>简体中文</strong> ·
<a href="https://gyxing.github.io/filumo-viewer/playground" target="_blank" rel="noopener noreferrer">在线示例</a> ·
<a href="https://gyxing.github.io/filumo-viewer/docs" target="_blank" rel="noopener noreferrer">对接文档</a>
</p>

纯文本与日志文件的只读预览插件，提供自动编码识别、行号、换行、查找，以及未知格式的可读文本兜底。

本文档对应 **0.1.0**。以下命令展示 npm 发布后的消费方式；从当前源码工作区使用时，请先按接入指南构建各包。

## 主要能力

- 默认接管 TXT、LOG、INI、CONF、CFG、PROPERTIES、OUT；可追加明确的文本扩展名。
- 结合 BOM、来源 charset、UTF-16 字节特征、严格 UTF-8 和 GB18030 进行编码判断；保留手动 UTF-8、UTF-16LE/BE、GBK、GB18030 切换。
- 默认显示真实行号并自动换行；只有专用插件均未匹配时才尝试文本兜底，已匹配格式的解析失败不会被吞掉。

## 安装

```sh
pnpm add @filumo/dom @filumo/text
# 或使用 npm
npm install @filumo/dom @filumo/text
```

## 最小接入

```html
<div id="viewer"></div>
<button id="dispose" type="button">关闭预览</button>
```

```ts
import { createViewer } from '@filumo/dom';
import { text } from '@filumo/text';

const container = document.getElementById('viewer');
if (!container) throw new Error('缺少预览容器');

const viewer = createViewer(container, {
  plugins: [text()],
  height: 640,
  locale: 'zh-CN',
  resourcePolicy: { maxFileBytes: 20 * 1024 * 1024 },
  onError: (error) => console.error(error),
});

try {
  await viewer.open(new File(['第一行\n第二行'], 'example.txt'));
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

| 配置项                   | 默认值             | 说明                                                          |
| ------------------------ | ------------------ | ------------------------------------------------------------- |
| `encoding`               | auto               | 支持自动识别与显式编码；无 BOM 文本的推断仍可能需要手动纠正。 |
| `fallback`               | true               | 是否在专用插件均未匹配后探测未知格式的可读文本。              |
| `lineNumbers`            | true               | 是否显示真实行号，可在更多菜单中切换。                        |
| `wrap`                   | true               | 是否启用自动换行。                                            |
| `extensions`             | 默认文本扩展名     | 追加可直接识别的文本后缀；不是强制执行 HTML/XML 的入口。      |
| `worker / workerFactory` | auto / 内置 Worker | 解析任务执行方式与 Worker 创建器。                            |

完整类型以公开声明与源码为准；没有列出的功能不能通过猜测选项名开启。

## 编码、原文与兜底

自动编码利用 BOM、来源 charset、明显 UTF-16 字节特征、严格 UTF-8 和 GB18030；缺少声明时属于推断，不保证字节流只有一种解读。手动切换失败保留已有正文并提示重试，不重新下载来源。

仅当所有专用插件都未匹配时，才对未知格式做有界探测和完整可读性校验；常见二进制文件不因后缀未知就当成文本，不能确认时提示不支持。HTML/XML 在本包中保持字面内容。显式选择 Text 使用已注册插件的 pluginId: 'text'。

普通 INI/CONF/CFG/Properties 属于 Text；CMakeLists.txt、Dockerfile、.env 变体等明确代码文件名给 Code 留出识别机会。需要 Markdown、JSON、XML 格式效果时应安装相应插件。

## 公共能力和行号

新代码复用解码、索引和查找时直接依赖 @filumo/core/text，复用原文 UI 时直接依赖 @filumo/dom/text；本包 reader/view 是兼容入口，不是其他格式的基础依赖。

原文采用可见行渲染，默认只显示真实行号；末行下方保留背景，不补虚假内容。行号、换行和查找位于更多菜单，操作不改变原始下载字节。不提供编辑、保存或代码语法高亮。

## 样式与运行环境

默认 auto 模式随实际视图加载样式，通常不需要手动导入 CSS。若宿主选择 `stylePolicy: { mode: 'external' }`，在创建查看器前加载匹配版本的外部样式：

```ts
import '@filumo/dom/styles.css';
import '@filumo/text/styles.css';
```

模块 Worker 部署时保留本包 worker.js 和 worker-chunks 相对结构；打包器无法自动处理时通过 workerFactory 创建。auto 按环境选择任务执行方式，always 要求可用 Worker，never 使用本包允许的无 Worker 路径；Code 的高亮例外见 Code 包说明，不会回退到主线程做同样的增强。

字符串输入表示 URL，不表示文件正文；直接文本内容请使用 File/Blob。支持的来源还包括 Uint8Array、带 name/mimeType/request 的 URL 对象和自定义 DocumentSource 工厂。远程文件和辅助资源需要满足宿主的网络、CORS 与 CSP 配置。

包以 ESM 发布，包含 TypeScript 声明；不提供 CommonJS require 入口。查看器挂载、图片解码和文件选择在浏览器执行；导入轻量入口不等于支持在服务端渲染文件。宿主应在客户端生命周期创建实例，并在不再使用时销毁。

## 公开入口

| 公开入口                  | 用途                                                     |
| ------------------------- | -------------------------------------------------------- |
| `@filumo/text`            | text 工厂及公开配置类型                                  |
| `@filumo/text/reader`     | 兼容文本读取入口；新公共复用优先使用 @filumo/core/text   |
| `@filumo/text/view`       | 兼容原文视图入口；新公共复用优先使用 @filumo/dom/text    |
| `@filumo/text/styles.css` | 预编译外部样式资源，用于 external 样式模式               |
| `@filumo/text/worker.js`  | 模块 Worker 资源；部署时保留相关分块，不作为普通函数导入 |

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
| [@filumo/pdf](https://www.npmjs.com/package/@filumo/pdf)           | PDF 连续阅读、大纲、缩略图和查找             | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/pdf/README.zh-CN.md)      |
| [@filumo/image](https://www.npmjs.com/package/@filumo/image)       | 图片预览、缩放、旋转、拖动及共享弹层         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/image/README.zh-CN.md)    |
| **[@filumo/text](https://www.npmjs.com/package/@filumo/text)**     | 纯文本、日志、编码识别与可读文本兜底         | [README](https://github.com/gyxing/filumo-viewer/blob/master/packages/text/README.zh-CN.md)     |
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

- [本包源码与完整类型](https://github.com/gyxing/filumo-viewer/tree/master/packages/text/src)
- [框架接入指南](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/preview-integration.zh-CN.md)
- [格式能力与限制](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/compatibility.zh-CN.md)
- [文本类格式指南](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/text-formats.zh-CN.md)
- [图片与 PDF 部署](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/image-pdf.zh-CN.md)
- [独立框架示例](https://github.com/gyxing/filumo-viewer/tree/master/examples)
- [项目变更记录](https://github.com/gyxing/filumo-viewer/blob/master/CHANGELOG.md)
- [问题反馈](https://github.com/gyxing/filumo-viewer/issues)
- [MIT 许可证](https://github.com/gyxing/filumo-viewer/blob/master/packages/text/LICENSE)
