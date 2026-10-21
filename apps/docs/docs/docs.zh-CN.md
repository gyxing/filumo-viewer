---
title: Filumo 开发文档
description: Filumo 0.1.0 多格式文件预览：十五个包、九类插件、React 与 Vue 接入、公开 API 和资源部署。
keywords:
  - Filumo
  - file preview
  - document viewer
  - 文件预览
siteLayout: docs
toc: content
---

# Filumo 开发文档

Filumo 是跨框架的浏览器端文件预览组件。解析、图片、图表与预览在浏览器内完成，不依赖在线文档转换服务。React、Vue 3、Vue 2 和原生 JavaScript 共用原生 DOM 渲染器。

> 当前工作区版本为 **0.1.0**，尚未发布到 npm。下文只描述当前实现；已接入 Office、PDF、图片、Text、JSON、Markdown、CSV、XML 和 Code 九类只读插件，文档编辑和编辑后保存仍属于后续扩展。不要安装同名第三方包，也不要使用旧包入口。

<nav className="office-viewer-docs__quick-links" aria-label="文档快捷入口">
  <a href="#quick-start">快速接入</a>
  <a href="#viewer-options">参数与事件</a>
  <a href="#capabilities">工具栏与能力</a>
  <a href="#office-options">Office 配置</a>
  <a href="#development">本地开发</a>
</nav>

## 包选择与按需加载

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

只选择自己的框架适配包，不需要安装 React、Vue 两套运行时。原生 JS 和 Vue 的 Office 预览不依赖 React。

`office()` 创建轻量描述符，真正打开文档时才加载驱动和对应格式视图。图片与 PDF 的资源部署见 [图片与 PDF 指南](./guides/image-pdf)。未注册的插件不会隐式加载。

全部十五个包及安装组合见[包总览](./guides/packages)。\
标准预设是冻结的只读数组，包含九类描述符；它不提供框架组件、createViewer 或独立 styles.css。安装预设会安装全部格式依赖，运行时仍按文件类型懒加载。

## 安装与工作区使用

仓库开发使用固定的 pnpm 版本：

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm demo:react
```

发布后，宿主安装自己的适配器与所需格式包，或使用 `@filumo/viewer` 标准预设；发布前使用工作区或经过构建、打包的本地包。左侧框架接入指南提供完整步骤。所有包使用 ESM，宿主负责提供匹配的 React 或 Vue。

**普通接入不需要手动导入 CSS，也不要求配置 Less loader。**

<a id="quick-start"></a>

## React 快速接入

```tsx | pure
import { useRef } from 'react';
import { DocumentViewer } from '@filumo/react';
import { office } from '@filumo/office';
import type { ViewerHandle } from '@filumo/react';

const plugins = [office()];
export function Preview({ file }: { file?: File }) {
  const ref = useRef<ViewerHandle>(null);
  return (
    <DocumentViewer
      ref={ref}
      source={file}
      plugins={plugins}
      options={{ height: 640, locale: 'zh-CN' }}
      onReady={(session) => console.info(session.getSnapshot().format)}
      onError={(error) => console.error(error)}
    />
  );
}
```

不传 source 时显示文件选择入口。插件数组在模块级定义，或使用 useMemo 保持稳定；不要每次渲染重新执行 `[office()]`。只改变展示参数不应重复解析。

## Vue 3、Vue 2 与原生 JavaScript

Vue 3 使用 `@filumo/vue`，支持模板 ref、Composition API 和 KeepAlive。Vue 2 使用 `@filumo/vue2`，支持 Options API、$refs 和 KeepAlive；不要把 Vue 3 的 script setup 示例直接用于 Vue 2.6。

组件参数均为 source、plugins、options；事件为 ready、error、stateChange、capabilitiesChange。SFC 模板可使用 `@state-change` 和 `@capabilities-change`。运行时句柄不要放入深度响应式对象。左侧框架接入指南分别列出完整示例。

```ts | pure
import { createViewer } from '@filumo/dom';
import { office } from '@filumo/office';

const viewer = createViewer(container, {
  plugins: [office()],
  height: 640,
  onError: (error) => console.error(error),
});
await viewer.open(file);
// 宿主卸载时调用，不要在首次打开后立即销毁。
async function disposePreview() {
  await viewer.destroy();
}
```

## 文档来源 DocumentInput

| 输入         | 示例                                                  | 说明                               |
| ------------ | ----------------------------------------------------- | ---------------------------------- |
| File         | 文件选择器返回值                                      | 保留文件名、类型和大小             |
| Blob         | 服务返回的 Blob                                       | 无文件名时由 MIME 和容器内容识别   |
| Uint8Array   | new Uint8Array(buffer)                                | 内部保留副本；ArrayBuffer 需先转换 |
| string       | '/api/files/report.docx'                              | 支持 HTTP、HTTPS、blob URL         |
| URL 描述对象 | { url, name, mimeType, request }                      | 设置显示名称、类型和 RequestInit   |
| 来源工厂     | () => DocumentSource 或 Promise&lt;DocumentSource&gt; | 每次打开创建独立读取与释放租约     |

直接传入 Response、ArrayBuffer 或旧版 `async (signal) => Response` 不属于当前接口。

```ts | pure
await viewer.open({
  url: '/api/files/42',
  name: 'report.docx',
  request: { credentials: 'include' },
});
await viewer.open(new Uint8Array(buffer));
await viewer.open(file, { pluginId: 'office' });
```

pluginId 只选择已注册插件，不安装新插件。远程 URL 遵守浏览器 CORS、凭据和 CSP；相对地址根据宿主 Document 的 baseURI 解析。不要把密钥或长期令牌写进 URL、示例和日志。

<a id="viewer-options"></a>

## 组件参数与创建配置

| React 参数 | 类型                    | 默认/说明                |
| ---------- | ----------------------- | ------------------------ |
| source     | DocumentInput           | 可省略；变化时打开新来源 |
| plugins    | readonly ViewerPlugin[] | 必填；仅注册需要的格式   |
| options    | ViewerConfiguration     | 视图参数与创建策略       |
| className  | string                  | React 宿主容器类名       |
| ref        | ViewerHandle            | 方法、快照、订阅与销毁   |

Vue 接收相同的前三项，通过模板 ref 获取方法。原生 createViewer(container, options) 把 plugins、视图配置和回调放在同一个对象中。

### 视图参数 ViewOptions

| 字段      | 类型             | 默认值 | 行为                                |
| --------- | ---------------- | ------ | ----------------------------------- |
| height    | number 或 string | 560px  | 数字按 px；百分比要求祖先高度可计算 |
| zoom      | number           | 100    | Office 范围 25 ～ 300，单位为百分比 |
| theme     | light / dark     | light  | 外壳和面板主题，不改变源文档配色    |
| locale    | zh-CN / en-US    | zh-CN  | 查看器控件文案                      |
| watermark | string           | 无     | 只读展示水印，不改写原件            |
| toolbar   | boolean          | true   | false 隐藏默认工具栏                |

通过 `viewer.update({...})` 更新这些字段，不重新解析来源。

### 创建策略 ViewerConfiguration

| 字段                        | 用途                                      |
| --------------------------- | ----------------------------------------- |
| pluginId                    | 默认选择已注册插件；open 的同名参数可覆盖 |
| resourcePolicy.maxFileBytes | 通用来源读取大小限制，单位字节            |
| resourcePolicy.timeoutMs    | 当前打开流程的超时限制，单位毫秒          |
| stylePolicy.mode            | auto（默认）或 external                   |
| stylePolicy.nonce           | 自动注入 style 标签的宿主 CSP nonce       |

限制值必须是大于零的有限数。未配置时不添加任意文件硬上限，不代表浏览器内存无限。

框架适配器在 plugins 或创建策略变化时重建底层实例。原生句柄 update 只接受视图参数，创建策略变化应重新创建实例。Office 压缩包限制放在 office({ resourcePolicy }) 内。

## 事件与加载时序

| React / 原生回调     | Vue 事件           | 参数和时机                                             |
| -------------------- | ------------------ | ------------------------------------------------------ |
| onStateChange        | stateChange        | ControllerSnapshot；识别、加载、就绪、失败、取消等变化 |
| onReady              | ready              | DocumentSession；视图已挂载，可读取当前能力            |
| onCapabilitiesChange | capabilitiesChange | ViewerCapabilities；页码、搜索、格式动作等变化         |
| onError              | error              | Error；来源、解析、渲染或操作异常                      |
| office.onWarning     | 非组件事件         | OfficeWarning；可继续预览的降级提示                    |

ControllerSnapshot.status 为 idle、detecting、loading、ready、error、cancelled、disposed。progress 含 phase、可选 loaded/total；仅当 total 大于零时计算比例，不假定所有阶段都有精确百分比。

onReady 表示可以预览，不等于所有长文档分页、资源和渐进解析均已完成。会话状态、外壳就绪、格式能力属于不同层次，不能用固定延时替代就绪事件。

## 实例方法与生命周期

| 方法                            | 返回值              | 用途                                       |
| ------------------------------- | ------------------- | ------------------------------------------ |
| open(input, selection?)         | Promise&lt;void&gt; | 打开来源，替换旧任务和旧会话               |
| update(viewOptions)             | void                | 仅更新展示                                 |
| setActive(active)               | void                | 暂停/恢复呈现，不清空来源                  |
| getSnapshot()                   | ControllerSnapshot  | 状态、会话、错误和进度                     |
| subscribe(listener)             | () => void          | 订阅状态，返回取消订阅函数                 |
| getCapabilities()               | ViewerCapabilities  | 当前能力，未就绪时可能为空                 |
| subscribeCapabilities(listener) | () => void          | 订阅动作和能力变化                         |
| destroy()                       | Promise&lt;void&gt; | 幂等销毁会话、监听、Worker、资源和样式租约 |

React/Vue 卸载自动清理。Vue KeepAlive 停用时暂停呈现，恢复时保留会话。原生 JS 必须显式 destroy。

使用 source prop 驱动时，不要又在 effect/watch 中对同一来源调用 ref.open。source 变为 undefined 不等同于清空当前文档；需要空态时卸载并重新挂载。

<a id="capabilities"></a>

## 通用能力与自定义工具栏

| 能力       | 状态                                                            | 操作                             |
| ---------- | --------------------------------------------------------------- | -------------------------------- |
| zoom       | value、min、max、step；可选 presets、mode、toolbar              | set(percentage)、mode.set(value) |
| navigation | index、count；index 从 0 开始；可选 toolbar                     | goTo(index)                      |
| search     | query、resultCount、currentIndex、searching                     | setQuery、next、previous         |
| actions    | id、label、kind、enabled、pressed、value、options；可选 toolbar | run(value?)                      |

能力取决于当前插件与就绪状态。未就绪或不适用时禁用操作，不假定每个格式始终存在页码和查找。

```ts | pure
const stop = viewer.subscribeCapabilities(() => {
  const capabilities = viewer.getCapabilities();
  console.info(
    capabilities.navigation?.index,
    capabilities.search?.resultCount,
  );
});
await viewer.getCapabilities().zoom?.set(125);
await viewer.getCapabilities().search?.setQuery('关键字');
// 宿主卸载时取消订阅。
stop();
```

设置 toolbar: false 只隐藏默认工具栏，不删除能力。完整自定义按钮示例见接入指南。默认工具栏支持打开文件、缩放输入、原件下载和全屏；窄空间把次要操作收纳到更多面板。

Office 工具栏按文档内容显示专属操作：Word 显示实际存在的大纲和可用修订视图；Excel 显示原始布局 / 阅读模式；PPT 在多页时显示前后翻页及备注。Excel 和 PPT 有批注或审阅笔记时才显示批注入口。Word 页码导航和 Excel 工作表选择继续通过能力调用，默认工具栏不重复展示。

缩放组合框提供常用比例和适应模式；Excel 仅支持适应宽度，Word 与 PPT 还支持适应页面。确认手动比例后退出自适应模式。插件没有声明 presets 或 mode 时继续使用基本数值输入。

### Office 动作标识

| id                 | run 参数/行为                      | 范围                |
| ------------------ | ---------------------------------- | ------------------- |
| office.zoomMode    | percentage、fit-width、fit-page    | fit-page 不用于表格 |
| office.search      | 打开/关闭查找                      | Office              |
| office.outline     | 打开/关闭大纲                      | Word                |
| office.revision    | final、markup、original            | Word，只读修订投影  |
| office.review      | 打开/关闭批注面板                  | Excel、PPT          |
| office.sheet       | options 中的工作表 ID              | Excel               |
| office.sheetMode   | source、reading                    | Excel               |
| office.notes       | 打开/关闭备注                      | PPT                 |
| office.transitions | 切换源文件页级转场，默认工具栏隐藏 | PPT                 |

用 actions.find 查找动作并检查 enabled。参数从 options 读取，不把显示名称当作工作表 ID。切换缩放模式、修订显示或工作表不会修改原始文件。

<a id="office-options"></a>

## Office 插件配置

```ts | pure
import { office } from '@filumo/office';
const plugins = [
  office({
    worker: 'auto',
    media: false,
    fonts: { fallbackFamilies: ['Arial', 'sans-serif'], warnOnMissing: true },
    onWarning: (warning) => console.warn(warning.code, warning.message),
  }),
];
```

| 选项                | 类型/默认                              | 说明                           |
| ------------------- | -------------------------------------- | ------------------------------ |
| worker              | auto / always / never；默认 auto       | 自动回退、强制 Worker 或主线程 |
| workerFactory       | () => Worker                           | 特殊宿主提供新模块 Worker 实例 |
| fonts               | OfficeFontOptions                      | 字体别名、资源、回退和缺失告警 |
| media               | false 或 { allowExternal?, download? } | false 关闭；外部媒体默认禁止   |
| resourcePolicy      | Office 专属限制                        | 文件大小、超时和压缩包展开限制 |
| onWarning           | (OfficeWarning) => void                | 解析降级、字体和资源提示       |
| onHyperlinkActivate | (OfficeHyperlinkActivateEvent) => void | 观察/阻止默认超链接导航        |

Office resourcePolicy 支持 maxFileBytes、timeoutMs、maxArchiveEntries、maxArchiveEntryBytes、maxArchiveInflatedBytes、maxCompressionRatio。大小以字节计，比例无单位。通用来源策略控制下载读取阶段，Office 策略控制格式解析阶段；按实际文件分布选择限制。

## Worker 与部署

默认 Worker 作为 `@filumo/office/worker.js` 发布，通过 new URL/import.meta.url 引用。构建器应输出对应资源，不要把包内路径当作线上绝对 URL。

```ts | pure
const plugins = [
  office({
    worker: 'always',
    workerFactory: () =>
      new Worker('/assets/filumo-office-worker.js', { type: 'module' }),
  }),
];
```

自定义地址须由宿主真实部署，返回正确 JavaScript MIME，并符合 CSP 和跨域策略。auto 可回退；生产排错时使用 always 可暴露 Worker 资源问题，不应长期靠回退掩盖部署错误。

## 自动样式与 CSP

默认 stylePolicy.mode 为 auto。样式随外壳和格式视图加载，在同一 Document 内引用计数；卸载一个实例不会移除其他实例正在使用的样式。Office 使用所属包版本的样式作用域，图片弹层也保留这一作用域。

```tsx | pure
<DocumentViewer
  source={file}
  plugins={plugins}
  options={{ height: 640, stylePolicy: { nonce: cspNonce } }}
/>
```

只有宿主主动选择 external 时才需要手动加载：

```ts | pure
import '@filumo/dom/styles.css';
import '@filumo/image/styles.css';
import '@filumo/office/styles.css';
const viewer = createViewer(container, {
  plugins: [office()],
  stylePolicy: { mode: 'external' },
});
```

external 示例中的三个样式包都应声明为宿主直接依赖（`@filumo/dom`、`@filumo/image`、`@filumo/office`）。其他格式按实际启用的插件加载对应 styles.css；JSON/XML 原文由 DOM 提供，不要求引入 Text 样式。

CSS 必须匹配包版本；external 缺少匹配标记或同组多版本冲突会报错。nonce 仅授权 style 标签，动态定位与文档布局仍使用内联样式属性，需按宿主策略处理 style-src-attr。不要为解决样式问题关闭整个站点 CSP。

## 格式、图片与交互

| 文档族     | 支持扩展名                                | 交互                                              |
| ---------- | ----------------------------------------- | ------------------------------------------------- |
| Word       | DOC、DOCX、DOCM、DOTX、WPS                | 分页、大纲、查找、缩放、只读修订和批注            |
| Excel      | XLS、XLSX、XLSM、XLTX                     | 工作表、稀疏网格、冻结/合并、阅读模式、查找和批注 |
| PowerPoint | PPT、PPTX、PPTM、POTX                     | 缩略图、页码、备注、图片、媒体与部分转场          |
| PDF        | PDF                                       | 连续滚动、大纲、缩略图、查找、旋转与文字选择      |
| 图片       | PNG、JPEG、GIF、WebP、BMP、SVG、AVIF      | 缩放、拖动、旋转、复位；解码能力依赖浏览器        |
| Text       | TXT、LOG、INI、CONF、CFG、PROPERTIES、OUT | 编码识别、原文、行号、换行及可读内容兜底          |
| JSON       | JSON、JSONC、JSONL、NDJSON                | 结构与原文、重复键保留、记录诊断                  |
| Markdown   | MD、MARKDOWN                              | 阅读、原文、大纲、任务列表、表格及受控 HTML       |
| CSV        | CSV、TSV                                  | 表格窗口化、分隔符、列宽与选区复制                |
| XML        | XML                                       | 原文与结构双栏、命名空间及源位置映射              |
| Code       | 常用语言、脚本、配置与构建文件            | 源码高亮、语言选择、行号及查找                    |

- 双击图片可缩放、旋转、复位、下载和关闭，Esc 恢复到触发节点。
- 表格原始模式保留行高/列宽；阅读模式调整可读性，空白网格只补到视口。
- 普通文本选择不执行超链接；按控件提示使用 Ctrl/Command + 单击。event.preventDefault() 可阻止默认导航。
- fonts.aliases、fallbackFamilies、sources 可提供合法的字体映射和资源。缺失字体可能影响换行和分页。
- 宏代码不执行。修订、批注、公式缓存、媒体呈现不等于完整 Office 编辑环境。

## 原件导出与后续编辑

```ts | pure
import { exportOriginal } from '@filumo/core';
const session = viewer.getSnapshot().session;
if (session) {
  const result = await exportOriginal(session.source, session.signal);
  console.info(result.name, result.bytes.byteLength);
}
```

result.bytes 为独立副本；下载、存储和对象 URL 撤销由宿主负责。水印、缩放、阅读模式、修订投影不会改变原件。

当前没有 save、编辑命令、撤销栈、协作或格式回写 API。exportOriginal 不能当作保存编辑后的文档；插件与后续编辑扩展指南说明该边界。

## 错误处理与安全

open 可能拒绝，同时通过 onError/error 上报。被新任务替换的加载使用 AbortError 取消，不应展示为业务故障。

| 常见 Core 错误码                        | 排查方向                   |
| --------------------------------------- | -------------------------- |
| INVALID_INPUT / INVALID_SOURCE_URL      | 输入类型、URL 协议         |
| UNKNOWN_PLUGIN / UNSUPPORTED_FORMAT     | 插件注册、实际文件内容     |
| DUPLICATE_PLUGIN / PROTOCOL_MISMATCH    | 重复 ID、协议版本          |
| DOWNLOAD_FAILED                         | 响应码、网络、CORS、凭据   |
| FILE_SIZE_LIMIT_EXCEEDED / LOAD_TIMEOUT | 宿主限制与加载条件         |
| SOURCE_DISPOSED / VIEWER_DISPOSED       | 不复用已销毁的来源或查看器 |

不要假定所有 Error 都有 code，格式解析、资源和浏览器错误可能来自不同层。文件留在浏览器不等于零风险，仍应配置资源策略；日志不可包含原始文件、认证头或令牌。

<a id="development"></a>

## 本地开发与调试

| 命令                            | 用途                                       |
| ------------------------------- | ------------------------------------------ |
| pnpm docs:dev                   | dumi 文档和公开 Playground，直接编译包源码 |
| pnpm smoke                      | React 接入的本地样本烟测，/dev/smoke-test  |
| pnpm demo:js                    | 原生 JS 的构建产物示例                     |
| pnpm demo:react                 | React 示例                                 |
| pnpm demo:vue3 / pnpm demo:vue2 | 独立 Vue 示例                              |
| pnpm build                      | 构建组件包                                 |
| pnpm docs:build                 | 公开文档生产构建                           |

docs:dev 和 smoke 通过源码别名及开发插件联动 packages 源码修改；首次启动只准备元数据、样本和 PDF 资源。独立 demo 消费构建产物，修改包源码后仍需重新构建并重启 demo。默认端口 4173，可追加 --port 4174。详细测试步骤、样本隐私和环境变量见本地开发与测试指南。

## 兼容、限制与迁移

当前声明支持 React >=18 <20、Vue >=3.3 <4 与 Vue 2.6/2.7。仓库历史验证曾覆盖 React 18.3.1/19.2.0、Vue 3.5.43、Vue 2.6.14/2.7.16 和 Vite 5.4.21；这不代表改名后 0.1.0 的全部格式已重新通过验证。支持 Vue 2 不等于支持 IE11 或所有 Webpack 4 默认配置。

浏览器排版、字体、复杂二进制 Office、图表和媒体编码存在边界，不能保证与 Microsoft Office/WPS 逐像素相同。渐进和窗口化呈现的首屏就绪不代表全部页面完成。

旧包的 uri、parseOptions、defaultViewState 和 layout 深层入口不属于 Filumo API。按迁移指南重新选择包和参数，不添加旧入口兼容层。导航中指南均提供中英文版本，本机业务样本和内部实施计划不进入公开站点。
