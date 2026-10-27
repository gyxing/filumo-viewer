---
title: 查看器 API
description: 来源、创建配置、事件、生命周期和能力接口。
keywords:
  - Filumo
  - file preview
  - document viewer
siteLayout: docs
toc: content
---

# 查看器 API

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
| zoom      | number           | 随格式 | 百分比；初始模式见下方说明          |
| theme     | light / dark     | light  | 外壳和面板主题，不改变源文档配色    |
| locale    | zh-CN / en-US    | zh-CN  | 查看器控件文案                      |
| watermark | string           | 无     | 只读展示水印，不改写原件            |
| toolbar   | boolean          | true   | false 隐藏默认工具栏                |

通过 `viewer.update({...})` 更新这些字段，不重新解析来源。

初始比例按格式区分：Word、Excel 为 100%；PPT 未传 zoom 时适应页面；PDF 初始适应宽度，图片初始适应容器。显式比例与后续更新须遵守当前格式能力范围，不应把外壳默认值视为所有格式都固定 100%。

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

缩放组合框提供常用比例和适应模式；Excel 仅支持适应宽度，Word 与 PPT 还支持适应页面。确认手动比例后退出自适应模式。插件未声明 presets 时，外壳默认提供 25%、50%、75%、100%、125%、150%、200%，并按能力范围过滤。手动输入范围由格式决定，Office 当前为 25 ～ 300%。

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

全部扩展名、构建文件名及文件名变体见[完整格式清单](./compatibility)。

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

各格式工厂的完整参数见[格式插件参数](./plugin-api)；资源与 CSP 配置见[生产部署](./deployment)，按现象排查见[问题排查](./troubleshooting)。

## 单次资源与原件下载

嵌入查看器通过 `toolbar: false` 隐藏自己的工具栏，格式能力仍由 `getCapabilities()` 和 `subscribeCapabilities()` 提供。外壳补充的 `download` 能力含 `enabled`、`reason` 和 `run(): Promise<void>`，运行时下载该查看器的原始来源，继续遵守宿主接管、格式限制和会话取消。可选 `downloadTargets` 是下载菜单目标数组，每项包含 `id`、`label`、可选 `enabled`/`reason`；`kind: 'original'` 使用当前查看器原件通道，`kind: 'custom'` 通过 `run(signal)` 委托其他目标。未声明时保留原来的单次下载按钮。

`viewer.open(input, { resources: { baseUrl, resolveResource } })` 只影响本次打开，返回 undefined 表示阻止，不回退外部请求。`DocumentSource.openStream(signal)` 可选提供可重放流。`ViewerOptions.downloadOriginal(source, signal)` 接管原件下载；`ViewerCapabilities.originalDownload` 可覆盖或禁止不安全的默认物化。`ViewContext.createChildViewer` 供归档条目复用已注册格式。
