# @filumo/xml

Read-only XML viewer for Filumo, with a resizable source/tree layout, namespace-aware colored labels and source-range navigation.

XML 原文与结构树双栏只读预览插件，支持命名空间、属性、文本、CDATA 和注释的分段着色与原文定位。

本文档对应 **0.1.0**。以下命令展示 npm 发布后的消费方式；从当前源码工作区使用时，请先按接入指南构建各包。

## 主要能力

- 宽容器默认等分双栏，可拖动分隔线；窄容器按当前模式显示原文或结构。
- 结构中的名称、值与辅助标点使用不同语义色，选中后保留颜色；值始终按字符串呈现。
- 结构解析和原文着色独立按需加载，结构错误保留原文。默认显示真实行号，可从更多菜单开关。

## 安装

```sh
pnpm add @filumo/dom @filumo/xml
# 或使用 npm
npm install @filumo/dom @filumo/xml
```


## 最小接入

```html
<div id="viewer"></div>
<button id="dispose" type="button">关闭预览</button>
```

```ts
import { createViewer } from '@filumo/dom';
import { xml } from '@filumo/xml';

const container = document.getElementById('viewer');
if (!container) throw new Error('缺少预览容器');

const viewer = createViewer(container, {
  plugins: [xml()],
  height: 640,
  locale: 'zh-CN',
  resourcePolicy: { maxFileBytes: 20 * 1024 * 1024 },
  onError: (error) => console.error(error),
});

try {
  await viewer.open(new File(['<root><item id="1">Filumo</item></root>'], 'example.xml'));
} catch (error) {
  console.error(error);
}

document.getElementById('dispose')?.addEventListener('click', () => {
  void viewer.destroy();
});
window.addEventListener('pagehide', () => {
  void viewer.destroy();
}, { once: true });
```

将示例 URL 换成真实可访问的文件地址，或在文件选择事件中传入 File。20 MiB 等示例限制是宿主配置，不是库默认限制；关闭时由句柄释放会话、资源与样式租约。

## 常用配置

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `encoding` | auto | 支持通用编码识别，并读取 XML 声明的编码提示。 |
| `initialMode` | tree | tree：宽容器双栏；source：只读原文。 |
| `maxDepth / maxNodes` | 256 / 200,000 | XML 结构深度与节点预算。 |
| `worker / workerFactory` | auto / 内置 Worker | 结构解析执行策略。 |

完整类型以公开声明与源码为准；没有列出的功能不能通过猜测选项名开启。

## XML 语义与限制

保留命名空间名称、元素、属性、文本、CDATA、注释及处理指令的结构信息。没有 Schema 类型信息时，001、true 等值仍按字符串显示；长标签截断不改变源字符范围或定位。

当前不支持 DTD 文档，不以外部实体为入口加载资源。不提供 XSD/Schema 校验、XPath、XML 格式化或编辑保存。XML 标记不会执行为页面 HTML。

## 样式与运行环境

默认 auto 模式随实际视图加载样式，通常不需要手动导入 CSS。若宿主选择 `stylePolicy: { mode: 'external' }`，在创建查看器前加载匹配版本的外部样式：

```ts
import '@filumo/dom/styles.css';
import '@filumo/xml/styles.css';
```

模块 Worker 部署时保留本包 worker.js 和 worker-chunks 相对结构；打包器无法自动处理时通过 workerFactory 创建。auto 按环境选择任务执行方式，always 要求可用 Worker，never 使用本包允许的无 Worker 路径；Code 的高亮例外见本页，不会回退到主线程做同样的增强。

字符串输入表示 URL，不表示文件正文；直接文本内容请使用 File/Blob。支持的来源还包括 Uint8Array、带 name/mimeType/request 的 URL 对象和自定义 DocumentSource 工厂。远程文件和辅助资源需要满足宿主的网络、CORS 与 CSP 配置。

包以 ESM 发布，包含 TypeScript 声明；不提供 CommonJS require 入口。查看器挂载、图片解码和文件选择在浏览器执行；导入轻量入口不等于支持在服务端渲染文件。宿主应在客户端生命周期创建实例，并在不再使用时销毁。

## 公开入口

| 公开入口 | 用途 |
| --- | --- |
| `@filumo/xml` | xml 工厂及公开配置类型 |
| `@filumo/xml/styles.css` | 预编译外部样式资源，用于 external 样式模式 |
| `@filumo/xml/worker.js` | 模块 Worker 资源；部署时保留相关分块，不作为普通函数导入 |

未列出的包内路径不是稳定公共 API。独立格式不依赖 React/Vue 适配层，宿主只安装实际需要的格式和适配包。

## Filumo 包清单

当前包已加粗。每个包独立发布，包名链接到 npm，源码链接指向项目实际仓库。

<!-- filumo-packages:start -->

| 包（点击进入 npm） | 用途 | 源码说明 |
| --- | --- | --- |
| [@filumo/core](https://www.npmjs.com/package/@filumo/core) | 无 UI 的来源、插件协议、会话和公共文本处理 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/core#readme) |
| [@filumo/dom](https://www.npmjs.com/package/@filumo/dom) | 原生 DOM 查看器、工具栏、原文、大纲和共享 UI | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/dom#readme) |
| [@filumo/viewer](https://www.npmjs.com/package/@filumo/viewer) | 九类格式插件的标准预设与工厂聚合 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/viewer#readme) |
| [@filumo/office](https://www.npmjs.com/package/@filumo/office) | Word、Excel、PowerPoint 与受支持的旧格式 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/office#readme) |
| [@filumo/pdf](https://www.npmjs.com/package/@filumo/pdf) | PDF 连续阅读、大纲、缩略图和查找 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/pdf#readme) |
| [@filumo/image](https://www.npmjs.com/package/@filumo/image) | 图片预览、缩放、旋转、拖动及共享弹层 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/image#readme) |
| [@filumo/text](https://www.npmjs.com/package/@filumo/text) | 纯文本、日志、编码识别与可读文本兜底 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/text#readme) |
| [@filumo/json](https://www.npmjs.com/package/@filumo/json) | JSON / JSONC / JSONL / NDJSON 原文与结构 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/json#readme) |
| [@filumo/markdown](https://www.npmjs.com/package/@filumo/markdown) | Markdown 阅读、大纲、GFM 排版与代码高亮 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/markdown#readme) |
| [@filumo/csv](https://www.npmjs.com/package/@filumo/csv) | CSV / TSV 只读表格、虚拟滚动和查找 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/csv#readme) |
| **[@filumo/xml](https://www.npmjs.com/package/@filumo/xml)** | XML 原文、命名空间结构树和节点定位 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/xml#readme) |
| [@filumo/code](https://www.npmjs.com/package/@filumo/code) | 代码、脚本、配置及样式源码的只读高亮 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/code#readme) |
| [@filumo/react](https://www.npmjs.com/package/@filumo/react) | React 18/19 适配组件 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/react#readme) |
| [@filumo/vue](https://www.npmjs.com/package/@filumo/vue) | Vue 3（>=3.3 <4）适配组件 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/vue#readme) |
| [@filumo/vue2](https://www.npmjs.com/package/@filumo/vue2) | Vue 2（^2.6.14 或 ^2.7.16）适配组件 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/vue2#readme) |
<!-- filumo-packages:end -->

## 文档与反馈

- [本包源码与完整类型](https://github.com/gyxing/office-file-viewer/tree/master/packages/xml/src)
- [框架接入指南](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/guides/preview-integration.zh-CN.md)
- [格式能力与限制](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/guides/compatibility.zh-CN.md)
- [文本类格式指南](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/guides/text-formats.zh-CN.md)
- [图片与 PDF 部署](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/guides/image-pdf.zh-CN.md)
- [独立框架示例](https://github.com/gyxing/office-file-viewer/tree/master/examples)
- [项目变更记录](https://github.com/gyxing/office-file-viewer/blob/master/CHANGELOG.md)
- [问题反馈](https://github.com/gyxing/office-file-viewer/issues)
- [MIT 许可证](https://github.com/gyxing/office-file-viewer/blob/master/packages/xml/LICENSE)
