# @filumo/dom

Framework-independent DOM file viewer shell for Filumo, with toolbars, shared text surfaces, outlines and style management.

Filumo 的原生 DOM 渲染外壳，负责查看器容器、工具栏、格式能力绑定和样式租约；格式解析由显式注册的插件提供。

本文档对应 **0.1.0**。以下命令展示 npm 发布后的消费方式；从当前源码工作区使用时，请先按接入指南构建各包。

## 主要能力

- 不依赖 React 或 Vue，原生项目可直接调用 createViewer。
- 按当前格式发布工具栏能力，支持明暗主题、语言、缩放、水印和自定义高度。
- 共享原文、大纲、结构标签和分栏拖动采用独立公开子入口，避免为了复用 UI 依赖某个格式包。

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
| `plugins` | 必填 | ViewerPlugin 列表；安装外壳不会自动注册格式。 |
| `height` | 560 | 数字按 px 解释，也可传 CSS 高度字符串；百分比高度需要父容器有明确高度。 |
| `theme / locale` | light / zh-CN | 主题与界面语言；语言支持 zh-CN、en-US。 |
| `toolbar` | true | 是否展示工具栏。 |
| `zoom` | 由格式初始化 | 初始缩放百分比，能力边界由当前格式决定。 |
| `watermark` | 未设置 | 只读阅读区水印文字。 |
| `stylePolicy.mode / nonce` | auto / 未设置 | 自动样式租约或外部 CSS；nonce 用于自动样式。 |
| `resourcePolicy` | 未设置 | 通用 maxFileBytes 与 timeoutMs 限制。 |

完整类型以公开声明与源码为准；没有列出的功能不能通过猜测选项名开启。

## 生命周期与公共 UI

viewer.open(input, { pluginId }) 打开文件；update 更新视图参数；setActive(false) 停用当前视图；getCapabilities / subscribeCapabilities 读取和订阅当前格式的操作。最终调用 destroy()，不要只移除宿主 DOM。

`@filumo/dom/text` 提供 mountTextSurface，不负责取得字节或选择格式。底层原文表面默认隐藏行号；Text、JSON、XML、Code 格式层分别默认开启真实行号。直接组合解码和 UI 时，宿主应额外直接安装 @filumo/core，从 @filumo/core/text 读取，再调用 mountTextSurface(container, model, options)，最终 surface.dispose()。

`@filumo/dom/outline` 提供 OutlineTree 和树线、键盘导航、可选 renderLabel；`@filumo/dom/split` 提供 SplitHandle，创建者负责 update、setActive 和 dispose。不要导入包内部 src 文件。

`@filumo/dom/grid` 提供只读表格交互：GridInteractionController、GridColumnResize、GridSelection 和格式适配合同。CSV／TSV 与 Office 的 Excel 视图复用选择、键盘、复制与临时列宽，解析器和渲染器仍然独立。子入口只在格式视图加载时使用，不在注册插件时创建网格。

适配器提供零基源坐标、正文边界、几何命中、显示范围和按区文本迭代；公共模块不要求完整工作簿。创建者负责 setActive/dispose，保留两种格式的数据语义。复制默认上限为 100000 单元格、8 MiB 序列化 UTF-16 文本估算，失败或取消不交付部分结果。样式沿用 auto/external 策略，external 导入已有 @filumo/dom/styles.css，无须新的网格样式包。

## 样式与 CSP

默认 auto 模式随实际视图加载样式，在同一 Document 内共享租约。通常不需要手动导入 CSS。external 模式须在创建前加载 DOM 与实际格式样式，例如：

此示例额外导入图片包的样式，宿主需直接声明它：

```sh
pnpm add @filumo/image
```

```ts
import '@filumo/dom/styles.css';
import '@filumo/office/styles.css';
import '@filumo/image/styles.css';

// 创建时配置 stylePolicy: { mode: 'external' }。
```

Image CSS 用于 Office 的共享图片弹层。外部样式须匹配各包版本；auto 模式可配置 nonce，但不能替代宿主的 CSP 配置。本包没有默认格式，未注册格式时不会隐式加载。

## 输入与运行环境

字符串输入表示 URL，不表示文件正文；直接文本内容请使用 File/Blob。支持的来源还包括 Uint8Array、带 name/mimeType/request 的 URL 对象和自定义 DocumentSource 工厂。远程文件和辅助资源需要满足宿主的网络、CORS 与 CSP 配置。

包以 ESM 发布，包含 TypeScript 声明；不提供 CommonJS require 入口。查看器挂载、图片解码和文件选择在浏览器执行；导入轻量入口不等于支持在服务端渲染文件。宿主应在客户端生命周期创建实例，并在不再使用时销毁。

## 公开入口

| 公开入口 | 用途 |
| --- | --- |
| `@filumo/dom` | createViewer、查看器合同、能力类型与样式租约函数 |
| `@filumo/dom/outline` | OutlineTree 及结构树公共合同 |
| `@filumo/dom/styles.css` | 预编译外部样式资源，用于 external 样式模式 |
| `@filumo/dom/text` | mountTextSurface、TextViewport、TextFindBar、文本装饰和视图类型 |
| `@filumo/dom/text-messages` | 轻量编码错误文案入口，不引入原文视图 |
| `@filumo/dom/text-highlight` | 高亮输出到安全文本装饰的公共转换 |
| `@filumo/dom/split` | SplitHandle 及分栏拖动合同 |
| `@filumo/dom/grid` | 只读网格选择、键盘、复制、列宽及格式适配合同 |

未列出的包内路径不是稳定公共 API。独立格式不依赖 React/Vue 适配层，宿主只安装实际需要的格式和适配包。

## Filumo 包清单

当前包已加粗。每个包独立发布，包名链接到 npm，源码链接指向项目实际仓库。

<!-- filumo-packages:start -->

| 包（点击进入 npm） | 用途 | 源码说明 |
| --- | --- | --- |
| [@filumo/core](https://www.npmjs.com/package/@filumo/core) | 无 UI 的来源、插件协议、会话和公共文本处理 | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/core#readme) |
| **[@filumo/dom](https://www.npmjs.com/package/@filumo/dom)** | 原生 DOM 查看器、工具栏、原文、大纲和共享 UI | [README](https://github.com/gyxing/office-file-viewer/tree/master/packages/dom#readme) |
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

- [本包源码与完整类型](https://github.com/gyxing/office-file-viewer/tree/master/packages/dom/src)
- [框架接入指南](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/guides/preview-integration.zh-CN.md)
- [格式能力与限制](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/guides/compatibility.zh-CN.md)
- [文本类格式指南](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/guides/text-formats.zh-CN.md)
- [图片与 PDF 部署](https://github.com/gyxing/office-file-viewer/blob/master/apps/docs/docs/guides/image-pdf.zh-CN.md)
- [独立框架示例](https://github.com/gyxing/office-file-viewer/tree/master/examples)
- [项目变更记录](https://github.com/gyxing/office-file-viewer/blob/master/CHANGELOG.md)
- [问题反馈](https://github.com/gyxing/office-file-viewer/issues)
- [MIT 许可证](https://github.com/gyxing/office-file-viewer/blob/master/packages/dom/LICENSE)
