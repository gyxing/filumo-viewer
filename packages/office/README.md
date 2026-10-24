# @filumo/office

Lazy-loaded read-only Word, Excel and PowerPoint previews for Filumo, supporting DOCX, XLSX, PPTX and legacy Office files.

以原生 DOM 提供 Word、Excel、PowerPoint 只读预览，不要求宿主安装 React/Vue，也不依赖服务端格式转换。

本文档对应 **0.1.0**。以下命令展示 npm 发布后的消费方式；从当前源码工作区使用时，请先按接入指南构建各包。

## 主要能力

- Word：DOCX、DOCM、DOTX、DOC、WPS；电子表格：XLSX、XLSM、XLTX、XLS；演示文稿：PPTX、PPTM、POTX、PPT。
- 按格式提供大纲、查找、工作表或幻灯片导航、修订/批注等现有能力；具体入口由文件内容决定。
- 图片双击预览按需复用 @filumo/image/view；支持宿主字体映射、字体来源和链接激活回调。

## 安装

```sh
pnpm add @filumo/dom @filumo/office
# 或使用 npm
npm install @filumo/dom @filumo/office
```

## 最小接入

```html
<div id="viewer"></div>
<button id="dispose" type="button">关闭预览</button>
```

```ts
import { createViewer } from '@filumo/dom';
import { office } from '@filumo/office';

const container = document.getElementById('viewer');
if (!container) throw new Error('缺少预览容器');

const viewer = createViewer(container, {
  plugins: [office()],
  height: 640,
  locale: 'zh-CN',
  resourcePolicy: { maxFileBytes: 20 * 1024 * 1024 },
  onError: (error) => console.error(error),
});

try {
  await viewer.open('/files/example.docx');
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

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `worker` | auto | auto / always / never；按环境选择解析执行方式。 |
| `workerFactory` | 内置模块 Worker | 覆盖 Worker 创建方式，需保留 worker.js 和 worker-chunks 资源。 |
| `fonts` | 内置回退 | aliases、fallbackFamilies、sources、warnOnMissing 配置字体。 |
| `media` | 未显式禁用，外部媒体默认关闭 | false 可禁用；允许配置 allowExternal 和 download。 |
| `onWarning` | 未设置 | 接收字体、格式或解析告警，不代表接入测试已通过。 |
| `onHyperlinkActivate` | 默认链接处理 | 接收链接事务；可调用事件 preventDefault 后由宿主处理。 |
| `resourcePolicy` | 通用及格式策略 | 除文件字节和超时，还可限制归档条目、解压字节及压缩比。 |

完整类型以公开声明与源码为准；没有列出的功能不能通过猜测选项名开启。

## 格式、字体和资源边界

Excel 的只读网格与 CSV／TSV 共用 @filumo/dom/grid 交互，支持单元格及矩形选区、Shift 扩选、键盘导航、复制选区和临时列宽。选区覆盖完整合并区域，冻结区与正文共享逻辑位置，隐藏行列不作为键盘停留目标；不会编辑、计算公式或写回工作簿。

默认复制格式化后的显示文本，合并区域只在主单元格输出值，其余位置保留空字段。单次复制最多 100000 单元格和 8 MiB UTF-16 文本估算，失败或取消不写部分结果。列宽变化同步预览中的合并、冻结、换行及图片/图表锚点；更多菜单可恢复源列宽。手动调整列宽沿用当前缩放比例并退出自动适应，避免拖动回跳。每个工作表分别保留选区、阅读位置和预览列宽，重新打开文件不继承旧会话。

宏启用文件仅预览文档内容，不执行宏。复杂文档的字体、版式和对象效果取决于源文件与浏览器，不承诺与桌面 Office 像素一致。不提供编辑、保存、OCR 或服务端转换。

fonts.aliases、fallbackFamilies、sources 可配置宿主字体，字体文件由宿主部署；缺字可以通过 onWarning 报告。图片弹层按操作加载 Image 公共入口，不会在注册 office() 时提前渲染。

onHyperlinkActivate 接收包含 hyperlink、file、previewKind 的事务，可调用事件 preventDefault 接管默认导航。media.allowExternal 默认不允许外部媒体，是否加载由宿主策略决定。

## 样式与运行环境

默认 auto 模式随实际视图加载样式，通常不需要手动导入 CSS。若宿主选择 `stylePolicy: { mode: 'external' }`，在创建查看器前加载匹配版本的外部样式：

以下示例还直接导入 Image 样式，宿主需要显式安装该包，不能依赖依赖提升：

```sh
pnpm add @filumo/image
```

```ts
import '@filumo/dom/styles.css';
import '@filumo/office/styles.css';
import '@filumo/image/styles.css';
```

模块 Worker 部署时保留本包 worker.js 和 worker-chunks 相对结构；打包器无法自动处理时通过 workerFactory 创建。auto 按环境选择任务执行方式，always 要求可用 Worker，never 使用本包允许的无 Worker 路径；Code 的高亮例外见本页，不会回退到主线程做同样的增强。

字符串输入表示 URL，不表示文件正文；直接文本内容请使用 File/Blob。支持的来源还包括 Uint8Array、带 name/mimeType/request 的 URL 对象和自定义 DocumentSource 工厂。远程文件和辅助资源需要满足宿主的网络、CORS 与 CSP 配置。

包以 ESM 发布，包含 TypeScript 声明；不提供 CommonJS require 入口。查看器挂载、图片解码和文件选择在浏览器执行；导入轻量入口不等于支持在服务端渲染文件。宿主应在客户端生命周期创建实例，并在不再使用时销毁。

## 公开入口

| 公开入口 | 用途 |
| --- | --- |
| `@filumo/office` | office 工厂及公开配置类型 |
| `@filumo/office/styles.css` | 预编译外部样式资源，用于 external 样式模式 |
| `@filumo/office/worker.js` | 模块 Worker 资源；部署时保留相关分块，不作为普通函数导入 |

未列出的包内路径不是稳定公共 API。独立格式不依赖 React/Vue 适配层，宿主只安装实际需要的格式和适配包。

## Filumo 包清单

当前包已加粗。每个包独立发布，包名链接到 npm，源码链接指向项目实际仓库。

<!-- filumo-packages:start -->

| 包（点击进入 npm） | 用途 | 源码说明 |
| --- | --- | --- |
| [@filumo/core](https://www.npmjs.com/package/@filumo/core) | 无 UI 的来源、插件协议、会话和公共文本处理 | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/core#readme) |
| [@filumo/dom](https://www.npmjs.com/package/@filumo/dom) | 原生 DOM 查看器、工具栏、原文、大纲和共享 UI | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/dom#readme) |
| [@filumo/viewer](https://www.npmjs.com/package/@filumo/viewer) | 九类格式插件的标准预设与工厂聚合 | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/viewer#readme) |
| **[@filumo/office](https://www.npmjs.com/package/@filumo/office)** | Word、Excel、PowerPoint 与受支持的旧格式 | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/office#readme) |
| [@filumo/pdf](https://www.npmjs.com/package/@filumo/pdf) | PDF 连续阅读、大纲、缩略图和查找 | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/pdf#readme) |
| [@filumo/image](https://www.npmjs.com/package/@filumo/image) | 图片预览、缩放、旋转、拖动及共享弹层 | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/image#readme) |
| [@filumo/text](https://www.npmjs.com/package/@filumo/text) | 纯文本、日志、编码识别与可读文本兜底 | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/text#readme) |
| [@filumo/json](https://www.npmjs.com/package/@filumo/json) | JSON / JSONC / JSONL / NDJSON 原文与结构 | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/json#readme) |
| [@filumo/markdown](https://www.npmjs.com/package/@filumo/markdown) | Markdown 阅读、大纲、GFM 排版与代码高亮 | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/markdown#readme) |
| [@filumo/csv](https://www.npmjs.com/package/@filumo/csv) | CSV / TSV 只读表格、虚拟滚动和查找 | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/csv#readme) |
| [@filumo/xml](https://www.npmjs.com/package/@filumo/xml) | XML 原文、命名空间结构树和节点定位 | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/xml#readme) |
| [@filumo/code](https://www.npmjs.com/package/@filumo/code) | 代码、脚本、配置及样式源码的只读高亮 | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/code#readme) |
| [@filumo/react](https://www.npmjs.com/package/@filumo/react) | React 18/19 适配组件 | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/react#readme) |
| [@filumo/vue](https://www.npmjs.com/package/@filumo/vue) | Vue 3（>=3.3 <4）适配组件 | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/vue#readme) |
| [@filumo/vue2](https://www.npmjs.com/package/@filumo/vue2) | Vue 2（^2.6.14 或 ^2.7.16）适配组件 | [README](https://github.com/gyxing/filumo-viewer/tree/master/packages/vue2#readme) |

<!-- filumo-packages:end -->

## 文档与反馈

- [本包源码与完整类型](https://github.com/gyxing/filumo-viewer/tree/master/packages/office/src)
- [框架接入指南](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/preview-integration.zh-CN.md)
- [格式能力与限制](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/compatibility.zh-CN.md)
- [文本类格式指南](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/text-formats.zh-CN.md)
- [图片与 PDF 部署](https://github.com/gyxing/filumo-viewer/blob/master/apps/docs/docs/guides/image-pdf.zh-CN.md)
- [独立框架示例](https://github.com/gyxing/filumo-viewer/tree/master/examples)
- [项目变更记录](https://github.com/gyxing/filumo-viewer/blob/master/CHANGELOG.md)
- [问题反馈](https://github.com/gyxing/filumo-viewer/issues)
- [MIT 许可证](https://github.com/gyxing/filumo-viewer/blob/master/packages/office/LICENSE)
